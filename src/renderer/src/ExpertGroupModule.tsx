import { useState } from 'react'
import { Trash, WarningTriangle } from 'iconoir-react'
import type { ExpertGroupView } from '../../shared/expert-group-contract'
import { ClientModal, DetailPage, IconButton } from './components/client-ui'
import { ExpertGroupProfileContent } from './ExpertProfiles'

export function ExpertGroupModule({ group, onGroupsChanged }: { group?: ExpertGroupView; onGroupsChanged: (groups: ExpertGroupView[]) => void }): React.JSX.Element {
  const [dismissOpen, setDismissOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const dismiss = async (): Promise<void> => {
    if (!group) return
    setBusy(true)
    setError(undefined)
    try {
      await window.aiEmployeeOS.expertGroup.archive(group.id)
      const groups = await window.aiEmployeeOS.expertGroup.list()
      setDismissOpen(false)
      onGroupsChanged(groups)
    } catch (reason) {
      setError(`解雇失败：${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <DetailPage className="employee-detail-page expert-group-detail-page">{error && <p className="inline-error" role="alert">{error}</p>}{group ? <ExpertGroupProfileContent group={group} actions={<IconButton label="解雇专家团" icon={Trash} className="profile-dismiss-button" onClick={() => setDismissOpen(true)} />} /> : <div className="directory-empty"><h3>还没有已招募专家团</h3><p>点击通讯录右上角的招募按钮，浏览候选专家团。</p></div>}</DetailPage>

    <ClientModal open={dismissOpen} title={`解雇 ${group?.name ?? '专家团'}？`} size="small" onClose={() => setDismissOpen(false)}><div className="confirm-dialog"><span className="danger-icon"><WarningTriangle aria-hidden /></span><p>解雇后，该专家团不会再显示在通讯录中，悟空也不会再为新任务调用它；历史任务与交付记录仍会保留。</p><div className="confirm-actions"><button type="button" className="button button--quiet" onClick={() => setDismissOpen(false)}>取消</button><button type="button" className="button button--danger" onClick={() => void dismiss()} disabled={busy}>{busy ? '处理中' : '确认解雇'}</button></div></div></ClientModal>
  </>
}
