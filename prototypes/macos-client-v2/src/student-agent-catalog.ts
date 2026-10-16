import type { ExpertDraft } from './expert-creation'
import type { RecruitmentEmployee } from '../../../src/renderer/src/RecruitmentCatalog'

export interface StudentAgentProfile extends RecruitmentEmployee {
  configuration?: ExpertDraft
  prompt?: string
}

// Student-facing demo profiles; these do not register or publish Runtime agents.
export const studentAgentCategories: Array<{ id: string; name: string; description: string; employees: StudentAgentProfile[] }> = [
  {
    id: 'subjects', name: '学科辅导', description: '从听懂一个知识点，到独立解出一道题。',
    employees: [
      { id: 'student.calculus-tutor', name: '高数辅导', description: '拆解微积分、极限与级数，用分步讲解和练习帮你理解解题思路。', color: '#85a9c7' },
      { id: 'student.linear-algebra-tutor', name: '线代辅导', description: '理清矩阵、向量空间和特征值，把抽象概念与例题联系起来。', color: '#9994cf' },
      { id: 'student.english-tutor', name: '大学英语辅导', description: '练习四六级阅读、写作与口语，解释语法和表达，制定复习计划。', color: '#9ebd79' },
      { id: 'student.programming-tutor', name: '编程辅导', description: '陪你入门 Python、C++ 与数据结构，分析报错，理解代码为什么这样写。', color: '#6f9691' },
      { id: 'student.physics-tutor', name: '大学物理辅导', description: '讲清力学、电磁学与光学，梳理公式条件和实验分析思路。', color: '#d7b36a' },
      { id: 'student.economics-tutor', name: '经管学科辅导', description: '用生活案例解释微观经济、宏观经济与会计基础，梳理课程重点。', color: '#c49680' }
    ]
  },
  {
    id: 'games', name: '游戏攻略', description: '聊角色、配队和打法，也一起复盘卡住的关卡。',
    employees: [
      { id: 'student.honor-of-kings-guide', name: '王者荣耀攻略', description: '根据常玩位置和英雄，讨论出装思路、对线细节与团队配合。', color: '#d7b36a' },
      { id: 'student.league-of-legends-guide', name: '英雄联盟攻略', description: '分析英雄定位、对线与团战，结合你的对局描述梳理改进方向。', color: '#85a9c7' },
      { id: 'student.genshin-guide', name: '原神攻略', description: '结合已有角色讨论配队、养成顺序、探索路线与任务解谜。', color: '#9ebd79' },
      { id: 'student.starrail-guide', name: '星穹铁道攻略', description: '围绕角色养成、队伍搭配和关卡机制，规划资源与挑战思路。', color: '#9994cf' }
    ]
  },
  {
    id: 'travel', name: '旅游出行', description: '按学生预算和空闲时间，安排一趟合适的旅行。',
    employees: [
      { id: 'student.weekend-trip-guide', name: '周末周边游', description: '从出发城市、预算和兴趣出发，安排一到两天的周边游路线。', color: '#9ebd79' },
      { id: 'student.holiday-trip-planner', name: '假期旅行规划', description: '根据假期天数与同行人数，梳理目的地、每日路线和行前清单。', color: '#85a9c7' },
      { id: 'student.budget-travel-guide', name: '旅行省钱搭子', description: '拆分交通、住宿、门票和餐饮预算，帮你比较方案与取舍。', color: '#d7b36a' }
    ]
  },
  {
    id: 'relationships', name: '恋爱交流', description: '认真表达喜欢，也尊重彼此的感受与边界。',
    employees: [
      { id: 'student.relationship-guide', name: '恋爱专家', description: '聊暗恋、告白和相处中的困惑，练习真诚表达、理解差异与沟通边界。', color: '#d8a2a8' },
      { id: 'student.date-planner', name: '约会灵感师', description: '结合双方兴趣、时间和学生预算，想一些轻松自然的约会安排。', color: '#c49680' }
    ]
  },
  {
    id: 'emotions', name: '情绪陪伴', description: '有人听你说，也帮你慢慢理清心里的事。',
    employees: [
      { id: 'student.emotional-support', name: '情感陪伴专家', description: '倾听失落、孤独、失恋或人际烦恼，陪你梳理感受与自己的需要。', color: '#b2a3ca' },
      { id: 'student.stress-support', name: '压力调节搭子', description: '面对考试、作业和未来的不确定，整理压力来源，安排可做到的小步骤。', color: '#6f9691' }
    ]
  },
  {
    id: 'campus', name: '校园成长', description: '把学习、求职和校园里的想法，变成具体行动。',
    employees: [
      { id: 'student.study-planner', name: '学习规划师', description: '根据课程、考试与当前进度，拆分学习任务，安排复习和复盘节奏。', color: '#85a9c7' },
      { id: 'student.career-coach', name: '实习求职教练', description: '整理项目经历、打磨简历和练习面试，探索适合自己的实习方向。', color: '#d7b36a' },
      { id: 'student.campus-event-planner', name: '社团活动策划', description: '为社团招新、班级活动与校园比赛梳理主题、分工、预算和执行清单。', color: '#9ebd79' }
    ]
  }
]
