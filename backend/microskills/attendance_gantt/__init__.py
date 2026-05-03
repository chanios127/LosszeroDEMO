from microskills.attendance_gantt.skill import AttendanceGanttSkill
from microskills.registry import register

register(AttendanceGanttSkill())

__all__ = ["AttendanceGanttSkill"]
