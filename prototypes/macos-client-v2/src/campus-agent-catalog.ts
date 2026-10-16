import { studentAgentCategories } from './student-agent-catalog'

export type CatalogAudience = 'student' | 'staff'
export type CampusAgentCategory = (typeof studentAgentCategories)[number] & { audience: CatalogAudience }

const staffAgentCategories: CampusAgentCategory[] = [
  {
    id: 'teaching', name: '教学备课', audience: 'staff', description: '从课程目标到课堂练习，准备一堂有重点的课。',
    employees: [
      { id: 'staff.lesson-planner', name: '备课教案助手', description: '结合课程目标、学生基础与课时，梳理教学重点、课堂流程和互动活动。', color: '#85a9c7' },
      { id: 'staff.courseware-planner', name: '课件大纲助手', description: '把教材或授课材料整理为课件大纲，补充案例思路、板书结构和课堂提问。', color: '#9994cf' },
      { id: 'staff.assignment-designer', name: '作业设计助手', description: '围绕知识点设计分层练习、课堂测验和评价参考，帮助教师检查难度与覆盖范围。', color: '#9ebd79' }
    ]
  },
  {
    id: 'student-guidance', name: '学生指导', audience: 'staff', description: '为日常沟通、学业发展和毕业指导做好准备。',
    employees: [
      { id: 'staff.counselor-assistant', name: '辅导员工作助手', description: '准备谈心谈话提纲、班会方案和学生沟通话术，整理后续跟进事项。', color: '#6f9691' },
      { id: 'staff.academic-advisor', name: '学业指导助手', description: '结合学生的学习目标与课程情况，梳理选课讨论、复习建议和阶段学习计划。', color: '#85a9c7' },
      { id: 'staff.thesis-advisor', name: '毕业论文指导助手', description: '梳理论文选题、开题框架与进度安排，依据已有稿件整理修改建议和答辩问题。', color: '#d7b36a' }
    ]
  },
  {
    id: 'research-support', name: '科研支持', audience: 'staff', description: '读懂研究材料，把思路组织成清楚的学术表达。',
    employees: [
      { id: 'staff.literature-reader', name: '文献阅读助手', description: '基于提供的文献提炼研究问题、方法与结论，对比不同材料并整理阅读笔记。', color: '#9994cf' },
      { id: 'staff.grant-assistant', name: '科研申报助手', description: '依据提供的申报指南，拆解材料要求、研究目标、技术路线与准备清单。', color: '#c49680' },
      { id: 'staff.academic-writing', name: '学术写作助手', description: '基于已有研究内容，优化论文结构、中英文摘要和论证表达，检查前后逻辑。', color: '#6f9691' }
    ]
  },
  {
    id: 'campus-office', name: '校务办公', audience: 'staff', description: '整理通知、会议与活动材料，减少日常文字工作。',
    employees: [
      { id: 'staff.notice-writer', name: '通知公文助手', description: '根据事项、对象与时间起草通知、请示和工作总结，检查信息是否齐全。', color: '#85a9c7' },
      { id: 'staff.meeting-notes', name: '会议纪要助手', description: '从提供的会议记录中整理议题、决议、负责人和待办，标出需要确认的信息。', color: '#d7b36a' },
      { id: 'staff.event-coordinator', name: '校园活动统筹助手', description: '为讲座、培训和院系活动准备流程、人员分工、物资预算与执行清单。', color: '#9ebd79' }
    ]
  }
]

// One catalog feeds directory cards, detail views and conversation identities.
export const campusAgentCategories: CampusAgentCategory[] = [
  ...studentAgentCategories.map((category) => ({ ...category, audience: 'student' as const })),
  ...staffAgentCategories
]
