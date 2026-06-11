import os
import re
import json
import requests
from django.conf import settings

OPENROUTER_API_KEY = getattr(settings, 'OPENROUTER_API_KEY', os.getenv('OPENROUTER_API_KEY'))
OPENROUTER_MODEL = "openai/gpt-4o-mini"

def _call_openrouter(prompt, system_prompt="You are a helpful AI assistant."):
    if not OPENROUTER_API_KEY:
        # Fallback to a mock response if no key is provided during testing
        print("WARNING: OPENROUTER_API_KEY is not set.")
        return ""
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
    }
    
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=60
        )
        if response.status_code == 200:
            res_json = response.json()
            return res_json['choices'][0]['message']['content'].strip()
        else:
            print(f"OpenRouter Error: {response.text}")
            raise Exception(f"API returned {response.status_code}")
    except Exception as e:
        print(f"OpenRouter Request Failed: {e}")
        raise e

def _extract_json(text):
    text = text.strip()
    if text.startswith('```json'):
        text = text[7:]
    elif text.startswith('```'):
        text = text[3:]
    if text.endswith('```'):
        text = text[:-3]
    text = text.strip()
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except:
            pass
    try:
        return json.loads(text)
    except:
        return None

def evaluate_resume_base(resume_text, initial_ats_score):
    system_prompt = "You are an expert AI Resume ATS Analyzer."
    prompt = f"""
    A rule-based system gave this resume an initial score of {initial_ats_score} / 100 based on word count, sections, action verbs, and metrics.
    
    Resume Text:
    {resume_text}

    Tasks:
    1. Adjust the ATS score out of 100 based on the actual quality of the content (impact, clarity, relevance).
    2. Extract a list of skills (technical, soft, tools) found in the resume.
    3. List the candidate's strengths.
    4. List areas of weakness or missing sections.
    5. Provide actionable suggestions to improve the resume for ATS systems.

    Return ONLY a valid JSON object with the following keys, no markdown formatting:
    {{
        "final_ats_score": integer between 0-100,
        "skills": ["skill1", "skill2"],
        "strengths": ["strength1", "strength2"],
        "weaknesses": ["weakness1", "weakness2"],
        "suggestions": ["suggestion1"]
    }}
    """
    
    try:
        result_text = _call_openrouter(prompt, system_prompt)
        parsed = _extract_json(result_text)
        if parsed:
            return parsed
        raise Exception("JSON Parsing Failed")
    except Exception as e:
        print(f"AI Base Evaluation Error: {e}")
        return {
            "final_ats_score": initial_ats_score,
            "skills": [],
            "strengths": ["Unable to generate via AI at this moment."],
            "weaknesses": ["Unable to generate via AI at this moment."],
            "suggestions": ["Ensure file formatting is clean and try again."]
        }

def evaluate_resume_for_job(resume_text, job_description, heuristic_score):
    system_prompt = "You are an expert technical recruiter matching a resume to a job description."
    prompt = f"""
    Job Requirements:
    {job_description}

    Resume:
    {resume_text}

    Tasks:
    1. Evaluate the match between the resume and the job requirements. A heuristic match was {heuristic_score}%. Provide an accurate match score (0-100).
    2. Identify specific required keywords/skills from the job description that are MISSING in the resume.

    Return ONLY a valid JSON object with the following keys, no markdown formatting:
    {{
        "job_match_score": integer between 0-100,
        "missing_skills": ["missing1", "missing2"]
    }}
    """
    
    try:
        result_text = _call_openrouter(prompt, system_prompt)
        parsed = _extract_json(result_text)
        if parsed:
            return parsed
        raise Exception("JSON Parsing Failed")
    except Exception as e:
        print(f"AI JD Matching Error: {e}")
        return {
            "job_match_score": heuristic_score,
            "missing_skills": ["AI processing failed to detect missing skills"]
        }


def generate_interview_question(resume_text, job_requirements, previous_questions=None, is_coding=False):
    if previous_questions is None:
        previous_questions = []
        
    system_prompt = "You are an expert technical interviewer conducting an interview."
    
    if is_coding:
        prompt = f"""
        Job Requirements: {job_requirements}
        Candidate Resume: {resume_text}
        Questions Already Asked: {previous_questions}

        Generate a highly relevant Data Structures & Algorithms (DSA) or Object-Oriented Programming (OOP) coding problem for this candidate.
        The difficulty should be medium.
        Return ONLY a string containing the question text, with clear requirements and examples. Do not provide the solution.
        """
    else:
        prompt = f"""
        Job Requirements: {job_requirements}
        Candidate Resume: {resume_text}
        Questions Already Asked: {previous_questions}

        Generate the next highly technical interview question for this candidate based on their resume skills, projects, DBMS, OS, or Networking. Do not repeat previous questions.
        Return ONLY a string containing the question text.
        """
    
    try:
        return _call_openrouter(prompt, system_prompt)
    except Exception as e:
        print(f"AI Generation Error: {e}")
        return "Could you provide more details about your relevant experience for this role?"


def evaluate_interview_answer(question, answer, resume_text, job_requirements):
    system_prompt = "You are an expert technical interviewer. Evaluate the candidate's answer based on Technical Knowledge, Accuracy, Communication, Confidence, Relevance, and Completeness."
    prompt = f"""
    Job Requirements: {job_requirements}
    Resume Context: {resume_text}
    
    Question Asked: {question}
    Candidate's Answer: {answer}

    Return ONLY a valid JSON object with the following keys, no markdown formatting:
    {{
        "score": integer between 1-10 rating the overall quality of the answer,
        "feedback": "Constructive feedback on the answer",
        "next_question": "A logical follow-up question based on their answer, or a new topic if they answered sufficiently"
    }}
    """
    
    try:
        result_text = _call_openrouter(prompt, system_prompt)
        parsed = _extract_json(result_text)
        if parsed:
            return parsed
        raise Exception("JSON Parsing Failed")
    except Exception as e:
        print(f"AI Evaluation Error: {e}")
        return {
            "score": 5,
            "feedback": "Your answer has been recorded, but AI evaluation is temporarily unavailable.",
            "next_question": "Please describe a challenging project you have worked on recently."
        }


def generate_final_report(job_requirements, attempts_data):
    system_prompt = "You are an expert technical interviewer summarizing an interview."
    prompt = f"""
    Job Requirements: {job_requirements}
    Interview Transcript: {json.dumps(attempts_data)}
    
    Provide a final assessment of the candidate based on their performance in the transcript.
    Return ONLY a valid JSON object with the following keys, no markdown formatting:
    {{
        "strengths": "String summarizing candidate's strengths based on the answers.",
        "weaknesses": "String summarizing areas for improvement.",
        "recommendation": "Final recommendation (e.g., 'Strongly Recommended', 'Recommended', 'Consider', 'Not Recommended')."
    }}
    """
    try:
        result_text = _call_openrouter(prompt, system_prompt)
        parsed = _extract_json(result_text)
        if parsed:
            return parsed
        raise Exception("JSON Parsing Failed")
    except Exception as e:
        print(f"AI Report Generation Error: {e}")
        return {
            "strengths": "The candidate successfully completed the interview.",
            "weaknesses": "Pending detailed manual review due to an AI processing delay.",
            "recommendation": "Review transcript manually."
        }
