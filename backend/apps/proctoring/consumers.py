import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .models import ViolationLog
from apps.interviews.models import InterviewSchedule

class ProctoringConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.interview_id = self.scope['url_route']['kwargs']['interview_id']
        self.room_group_name = f'proctoring_{self.interview_id}'

        # Join the room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Verify the interview exists and user is valid (simplified here)
        valid = await self.is_valid_interview(self.interview_id)
        if not valid:
            await self.close()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        """
        Receives WebSocket events from the Frontend indicating tabs switches,
        copy/paste, etc.
        """
        data = json.loads(text_data)
        event_type = data.get('type')
        message = data.get('message', '')

        # Process proctoring violation event
        violation_types = ['tab_switch', 'copy_paste', 'blur', 'multiple_persons', 'no_face', 'looking_away', 'voice_detected']
        if event_type in violation_types:
            # Log violation to the database asynchronously
            await self.log_violation(self.interview_id, event_type, message)
            
            # Optionally broadcast back a warning to the client
            warning_msg = "Please remain active on this browser tab during the interview. Excessive violations will terminate your session."
            
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'proctoring_warning',
                    'message': warning_msg,
                    'violation_type': event_type
                }
            )

    async def proctoring_warning(self, event):
        await self.send(text_data=json.dumps({
            'type': 'warning',
            'message': event['message'],
            'violation_type': event['violation_type']
        }))

    @database_sync_to_async
    def is_valid_interview(self, interview_id):
        return InterviewSchedule.objects.filter(id=interview_id).exists()

    @database_sync_to_async
    def log_violation(self, interview_id, event_type, msg):
        try:
            interview = InterviewSchedule.objects.get(id=interview_id)
            
            db_type_map = {
                'tab_switch': 'TAB_SWITCH',
                'copy_paste': 'COPY_PASTE',
                'blur': 'BLUR',
                'multiple_persons': 'MULTIPLE_PERSONS',
                'no_face': 'NO_FACE',
                'looking_away': 'LOOKING_AWAY',
                'voice_detected': 'VOICE_DETECTED'
            }
            db_type = db_type_map.get(event_type, 'OTHER')
                
            ViolationLog.objects.create(
                interview=interview,
                violation_type=db_type,
                description=msg
            )
            return True
        except Exception:
            return False
