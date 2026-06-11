from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import (Interview, Attempt, Question, PracticeInterview, PracticeAttempt, 
                     AptitudeQuestion, AptitudeTestResult, InterviewSchedule, 
                     InterviewAttempt, ProctoringViolation)
from .serializers import (InterviewSerializer, AttemptSerializer, QuestionSerializer,
                          PracticeInterviewSerializer, PracticeAttemptSerializer,
                          AptitudeQuestionSerializer, AptitudeTestResultSerializer,
                          InterviewScheduleSerializer, InterviewAttemptSerializer,
                          ProctoringViolationSerializer)
from apps.jobs.models import Application
from .tasks import generate_initial_question, process_interview_answer, process_practice_answer


class InterviewScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ('HR', 'ADMIN'):
            return InterviewSchedule.objects.all()
        return InterviewSchedule.objects.filter(candidate=user)
        
    def perform_create(self, serializer):
        from django.core.mail import send_mail
        from django.conf import settings
        application_id = self.request.data.get('application')
        application = get_object_or_404(Application, id=application_id)
        schedule = serializer.save(candidate=application.user)
        
        # Send Email
        subject = 'Your AI Interview Has Been Scheduled - JobVerse'
        body = f"""Hello {application.user.first_name},

Your AI interview for {application.job.title} has been scheduled.
Date: {schedule.scheduled_date}
Time: {schedule.scheduled_time}
Link: {schedule.meeting_link or 'Check Student Dashboard for AI Interview Info'}

Please log in to your JobVerse Student Dashboard to Accept or Reject this interview invitation.

Good luck!
JobVerse Team"""
        try:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [application.user.email], fail_silently=False)
        except Exception as e:
            print(f"Scheduling Email Error: {e}")

    @action(detail=True, methods=['post'], url_path='respond')
    def respond(self, request, pk=None):
        """Candidate accepts or rejects a scheduled interview."""
        schedule = self.get_object()
        # Ensure only the candidate can respond
        if request.user != schedule.candidate:
            return Response({'detail': 'Not authorised.'}, status=403)

        response_val = request.data.get('response')
        if response_val not in ('Accepted', 'Rejected'):
            return Response({'detail': 'Invalid response. Must be Accepted or Rejected.'}, status=400)

        schedule.status = response_val
        schedule.save()

        # Notify HR via email
        from django.core.mail import send_mail
        from django.conf import settings
        try:
            hr_email = schedule.application.job.created_by.email
            subject = f"Interview {response_val} - {schedule.candidate.get_full_name() or schedule.candidate.username}"
            body = (
                f"Hello,\n\nThe candidate {schedule.candidate.get_full_name() or schedule.candidate.username} "
                f"has {response_val.lower()} the interview for the position of {schedule.application.job.title}.\n\n"
                f"Scheduled Date: {schedule.scheduled_date} at {schedule.scheduled_time}\n\n"
                f"Please log in to the HR Dashboard to view the update.\n\nJobVerse Team"
            )
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [hr_email], fail_silently=False)
        except Exception as e:
            print(f"HR notification email error: {e}")

        serializer = self.get_serializer(schedule)
        return Response(serializer.data)



    @action(detail=True, methods=['post'], url_path='start')
    def start_interview(self, request, pk=None):
        schedule = self.get_object()

        resume_id = request.data.get('resume_id')
        resume_text = "Candidate Resume Content"  # fallback
        
        if resume_id:
            try:
                from apps.resumes.models import Resume
                resume = Resume.objects.get(id=resume_id, user=schedule.candidate)
                schedule.resume_id = resume.id
                schedule.save()
                if resume.summary:
                    resume_text = resume.summary
                elif resume.skills:
                    resume_text = f"Skills: {', '.join(resume.skills)}"
            except Exception as e:
                print(f"Failed to fetch selected resume: {e}")
        else:
            # Auto-resolve resume from the linked job application
            try:
                app_resume = schedule.application.resume
                if app_resume:
                    schedule.resume_id = app_resume.id
                    schedule.save()
                    resume_text = app_resume.summary if app_resume.summary else resume_text
            except Exception as e:
                print(f"Resume extraction error: {e}")

        # Generate first question
        from services.ai_service import generate_interview_question
        job_reqs = schedule.application.job.requirements
        first_q = generate_interview_question(resume_text, job_reqs, [])
        return Response({'question': first_q})

    @action(detail=True, methods=['post'], url_path='submit-answer')
    def submit_answer(self, request, pk=None):
        schedule = self.get_object()
        question = request.data.get('question')
        answer = request.data.get('answer')
        
        # New inputs for controlling flow
        question_count = int(request.data.get('question_count', 1))
        max_questions = int(request.data.get('max_questions', 25))
        
        from services.ai_service import evaluate_interview_answer, generate_interview_question
        job_reqs = schedule.application.job.requirements
        
        resume_text = "Candidate Context"
        if schedule.resume_id:
            from apps.resumes.models import Resume
            try:
                resume = Resume.objects.get(id=schedule.resume_id)
                resume_text = resume.summary or f"Skills: {', '.join(resume.skills)}"
            except:
                pass
        
        # Check if the NEXT question should be a coding assessment
        # Last 3 questions are coding
        next_is_coding = (question_count + 1) > (max_questions - 3)
        
        # Evaluate
        eval_result = evaluate_interview_answer(question, answer, resume_text, job_reqs)
        
        # Save attempt
        InterviewAttempt.objects.create(
            interview=schedule,
            question=question,
            answer=answer,
            score=eval_result.get('score', 0),
            feedback=eval_result.get('feedback', ''),
            is_coding=False
        )
        
        # Get next question (could be standard or coding)
        attempts = schedule.attempt_records.filter(is_coding=False)
        previous_qs = [a.question for a in attempts]
        
        if question_count >= max_questions:
            # Reached max questions, handled by frontend usually, but fallback
            next_q = "Thank you, that concludes the questions."
            is_coding_now = False
        else:
            next_q = generate_interview_question(resume_text, job_reqs, previous_qs, is_coding=next_is_coding)
            is_coding_now = next_is_coding

        return Response({
            'score': eval_result.get('score'),
            'feedback': eval_result.get('feedback'),
            'next_question': next_q,
            'is_coding': is_coding_now
        })

    @action(detail=True, methods=['post'], url_path='submit-code')
    def submit_code(self, request, pk=None):
        schedule = self.get_object()
        question = request.data.get('question')
        code = request.data.get('code')
        language = request.data.get('language', 'python')
        
        # Map languages for Piston API
        piston_lang_map = {
            'python': ('python', '3.10.0'),
            'javascript': ('javascript', '18.15.0'),
            'java': ('java', '15.0.2'),
            'cpp': ('c++', '10.2.0'),
            'c++': ('c++', '10.2.0')
        }
        
        lang, version = piston_lang_map.get(language.lower(), ('python', '3.10.0'))
        
        # Execute Code via Piston API
        import requests
        output = ""
        error = ""
        try:
            res = requests.post('https://emkc.org/api/v2/piston/execute', json={
                "language": lang,
                "version": version,
                "files": [
                    {
                        "name": "main",
                        "content": code
                    }
                ]
            })
            if res.status_code == 200:
                run_res = res.json().get('run', {})
                output = run_res.get('stdout', '')
                error = run_res.get('stderr', '')
            else:
                error = "Execution API failed."
        except Exception as e:
            error = str(e)
            
        # Basic Evaluation using AI
        from services.ai_service import evaluate_interview_answer
        job_reqs = schedule.application.job.requirements
        resume_text = "Candidate Context"
        if schedule.resume_id:
            from apps.resumes.models import Resume
            try:
                resume = Resume.objects.get(id=schedule.resume_id)
                resume_text = resume.summary or f"Skills: {', '.join(resume.skills)}"
            except:
                pass
                
        eval_context = f"Code language: {language}\nOutput: {output}\nError: {error}\n\nSubmitted Code:\n{code}"
        eval_result = evaluate_interview_answer(question, eval_context, resume_text, job_reqs)
        
        from .models import CodingSubmission
        CodingSubmission.objects.create(
            interview=schedule,
            question=question,
            language=language,
            code=code,
            output=output,
            error=error,
            score=eval_result.get('score', 0),
            feedback=eval_result.get('feedback', '')
        )
        
        return Response({
            'output': output,
            'error': error,
            'score': eval_result.get('score'),
            'feedback': eval_result.get('feedback')
        })

    @action(detail=True, methods=['post'], url_path='end')
    def end_interview(self, request, pk=None):
        schedule = self.get_object()
        attempts = schedule.attempt_records.all()
        coding_subs = schedule.coding_submissions.all()
        
        avg_tech = sum([a.score for a in attempts if a.score]) / max(attempts.count(), 1)
        avg_code = sum([c.score for c in coding_subs if c.score]) / max(coding_subs.count(), 1)
        
        schedule.technical_score = int(avg_tech * 10)
        schedule.coding_score = int(avg_code * 10)
        schedule.communication_score = 85 # Simulated/placeholder based on text completeness
        schedule.confidence_score = 80 # Simulated based on lack of proctoring violations
        
        # Generate combined final score
        schedule.final_score = int((schedule.technical_score * 0.4) + (schedule.coding_score * 0.4) + (schedule.communication_score * 0.2))
            
        attempts_data = [{"type": "Q&A", "question": a.question, "answer": a.answer, "score": a.score} for a in attempts]
        attempts_data += [{"type": "CODE", "question": c.question, "code": c.code, "score": c.score} for c in coding_subs]
        
        from services.ai_service import generate_final_report
        job_reqs = schedule.application.job.requirements
        report = generate_final_report(job_reqs, attempts_data)
            
        schedule.status = 'COMPLETED'
        schedule.strengths = report.get('strengths', "Good technical understanding shown in evaluated answers.")
        schedule.weaknesses = report.get('weaknesses', "Could provide more real-world examples in responses.")
        schedule.recommendation = report.get('recommendation', "Proceed to next round" if schedule.final_score > 65 else "Reject")
        schedule.save()
        
        # Send Email to HR
        from django.core.mail import send_mail
        from django.conf import settings
        hr_email = schedule.application.job.created_by.email
        subject = f"AI Interview Completed - {schedule.candidate_name}"
        body = f"Hello,\n\nThe AI Interview for candidate {schedule.candidate_name} ({schedule.application.job.title}) has been completed.\nFinal Score: {schedule.final_score}%\n\nStrengths:\n{schedule.strengths}\n\nWeaknesses:\n{schedule.weaknesses}\n\nRecommendation:\n{schedule.recommendation}\n\nPlease check the HR dashboard for the full report."
        try:
            send_mail(subject, body, getattr(settings, 'DEFAULT_FROM_EMAIL', 'exoic.jobverse.in@gmail.com'), [hr_email], fail_silently=False)
        except Exception as e:
            print(f"Error sending HR email: {e}")
            pass
        
        return Response({'detail': 'Interview completed successfully', 'score': schedule.final_score})


class InterviewAttemptViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return InterviewAttempt.objects.filter(interview__candidate=self.request.user)

class InterviewViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ('HR', 'ADMIN'):
            return Interview.objects.all()
        return Interview.objects.filter(application__user=user)

    @action(detail=True, methods=['post'], url_path='start')
    def start_interview(self, request, pk=None):
        interview = self.get_object()
        if interview.status != 'SCHEDULED':
            return Response({'detail': 'Interview is already started or completed.'}, status=status.HTTP_400_BAD_REQUEST)
        interview.status = 'IN_PROGRESS'
        interview.started_at = timezone.now()
        interview.save()
        generate_initial_question.delay(interview.id)
        return Response({'detail': 'JobVerse AI Interview Engine is initializing your session. First question is being generated.'})


class AttemptViewSet(viewsets.ModelViewSet):
    serializer_class = AttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Attempt.objects.filter(interview__application__user=self.request.user)

    def perform_create(self, serializer):
        attempt = serializer.save()
        process_interview_answer.delay(attempt.id)


# ─── PRACTICE INTERVIEWS ─────────────────────────────────────────────────────

class PracticeInterviewViewSet(viewsets.ModelViewSet):
    serializer_class = PracticeInterviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return PracticeInterview.objects.filter(user=self.request.user).order_by('-started_at')

    def perform_create(self, serializer):
        session = serializer.save(user=self.request.user)
        # Trigger Celery task to generate first question
        process_practice_answer.delay(session.id, '', is_first=True)

    @action(detail=True, methods=['post'], url_path='submit-answer')
    def submit_answer(self, request, pk=None):
        session = self.get_object()
        answer = request.data.get('answer', '')
        order = session.attempts.count() + 1

        attempt = PracticeAttempt.objects.create(
            practice=session,
            question_text=request.data.get('question_text', ''),
            answer=answer,
            order=order
        )
        # fire async evaluation + next question
        process_practice_answer.delay(session.id, answer, is_first=False)
        return Response({'detail': 'JobVerse AI Interview Engine is evaluating your answer and generating the next technical challenge.', 'attempt_id': attempt.id})

    @action(detail=True, methods=['post'], url_path='end')
    def end_session(self, request, pk=None):
        session = self.get_object()
        session.is_completed = True
        session.completed_at = timezone.now()
        session.save()
        return Response({'detail': 'Practice session completed!'})


# ─── APTITUDE TESTS ────────────────────────────────────────────────────────────

class AptitudeQuestionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AptitudeQuestionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AptitudeQuestion.objects.all()
        category = self.request.query_params.get('category')
        difficulty = self.request.query_params.get('difficulty')
        if category:
            qs = qs.filter(category=category)
        if difficulty:
            qs = qs.filter(difficulty=difficulty)
        return qs.order_by('?')[:20]  # Randomize and limit

    @action(detail=False, methods=['get'])
    def full_test(self, request):
        """Returns 20 random questions from each of the 4 domains (80 total) randomized."""
        import random
        categories = ['APTITUDE', 'LOGICAL', 'COMMUNICATION', 'DOMAIN']
        all_questions = []
        for cat in categories:
            # Get up to 20 random questions for this category
            cat_qs = AptitudeQuestion.objects.filter(category=cat).order_by('?')[:20]
            all_questions.extend(list(cat_qs))
            
        random.shuffle(all_questions)
        serializer = self.get_serializer(all_questions, many=True)
        return Response(serializer.data)


class AptitudeTestResultViewSet(viewsets.ModelViewSet):
    serializer_class = AptitudeTestResultSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post']

    def get_queryset(self):
        return AptitudeTestResult.objects.filter(user=self.request.user).order_by('-completed_at')

    def perform_create(self, serializer):
        # We handle creation manually in evaluate_test action
        pass

    @action(detail=False, methods=['post'])
    def evaluate_test(self, request):
        """
        Expects payload: 
        {
          "category": "FULL_TEST",
          "answers": [ {"question_id": 1, "selected": "A"}, ... ],
          "time_taken_seconds": 1200
        }
        """
        category = request.data.get('category', 'FULL_TEST')
        time_taken = request.data.get('time_taken_seconds', 0)
        answers_data = request.data.get('answers', [])
        fullscreen_violations = request.data.get('fullscreen_violations', 0)
        tab_violations = request.data.get('tab_violations', 0)
        screenshot_violations = request.data.get('screenshot_violations', 0)
        proctoring_logs = request.data.get('proctoring_logs', [])
        
        # Initialize domain totals based on the test type (Full Test = 20 per domain, Specific = 20 for that domain)
        domain_scores = {'APTITUDE': 0, 'LOGICAL': 0, 'COMMUNICATION': 0, 'DOMAIN': 0}
        domain_totals = {'APTITUDE': 0, 'LOGICAL': 0, 'COMMUNICATION': 0, 'DOMAIN': 0}
        
        if category == 'FULL_TEST':
            total_questions = 80
            domain_totals = {'APTITUDE': 20, 'LOGICAL': 20, 'COMMUNICATION': 20, 'DOMAIN': 20}
        else:
            total_questions = 20
            domain_totals[category] = 20
            
        total_score = 0
        detailed_responses = []

        # Fetch all questions in one go for efficiency
        q_ids = [ans.get('question_id') for ans in answers_data]
        questions = AptitudeQuestion.objects.filter(id__in=q_ids)
        q_map = {q.id: q for q in questions}

        for ans in answers_data:
            q_id = ans.get('question_id')
            selected = ans.get('selected')
            q = q_map.get(q_id)
            if not q:
                continue
                
            is_correct = (selected == q.correct_option)
            if is_correct:
                total_score += 1
                domain_scores[q.category] = domain_scores.get(q.category, 0) + 1
            
            detailed_responses.append({
                "question_id": q.id,
                "question_text": q.question_text,
                "category": q.category,
                "selected": selected,
                "correct": q.correct_option,
                "is_correct": is_correct,
                "explanation": q.explanation,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
            })
        
        # Format domain scores as nice readouts
        formatted_domain_scores = {
            k: {"score": v, "total": domain_totals[k]} for k, v in domain_scores.items() if domain_totals[k] > 0
        }

        result = AptitudeTestResult.objects.create(
            user=request.user,
            category=category,
            score=total_score,
            total_questions=total_questions,
            time_taken_seconds=time_taken,
            domain_scores=formatted_domain_scores,
            detailed_responses=detailed_responses,
            fullscreen_violations=fullscreen_violations,
            tab_violations=tab_violations,
            screenshot_violations=screenshot_violations,
            proctoring_logs=proctoring_logs
        )
        return Response(self.get_serializer(result).data, status=status.HTTP_201_CREATED)


class ProctoringViolationViewSet(viewsets.ModelViewSet):
    serializer_class = ProctoringViolationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'HR':
            return ProctoringViolation.objects.all()
        return ProctoringViolation.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
