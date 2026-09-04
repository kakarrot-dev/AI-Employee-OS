export interface ExpertGroupSummary {
  id: string
  name: string
  description: string
  members: Array<{ id: string; name: string; responsibility: string }>
}

export const candidateExpertGroups: ExpertGroupSummary[] = [
  {
    id: 'expert-group.meeting',
    name: '会议专家团',
    description: '由多个 Agent 协作完成会议筹备、过程记录和行动项跟进。',
    members: [
      { id: 'meeting-planner', name: '会议策划 Agent', responsibility: '整理议题、参会角色与会前材料。' },
      { id: 'meeting-recorder', name: '会议纪要 Agent', responsibility: '提炼决策、分歧与关键信息。' },
      { id: 'meeting-followup', name: '行动项跟进 Agent', responsibility: '整理负责人、截止时间与后续动作。' }
    ]
  },
  {
    id: 'expert-group.reimbursement',
    name: '报销专家团',
    description: '由多个 Agent 协作完成材料预检、票据核验和报销规则答疑。',
    members: [
      { id: 'reimbursement-intake', name: '报销受理 Agent', responsibility: '检查报销事项和材料是否齐全。' },
      { id: 'invoice-checker', name: '票据核验 Agent', responsibility: '核对票据信息、金额与重复风险。' },
      { id: 'policy-advisor', name: '报销政策 Agent', responsibility: '依据规则说明可报范围与补充要求。' }
    ]
  }
]
