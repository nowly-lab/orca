import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('custom viewer selects records and dispatches a fixture automation through IPC', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  const workspaceId = await waitForActiveWorktree(orcaPage)
  const temp = await mkdtemp(join(tmpdir(), 'orca-viewer-e2e-'))
  const pluginRoot = join(temp, 'plugin')
  await cp(join(process.cwd(), 'examples/plugins/selection-viewer'), pluginRoot, {
    recursive: true
  })
  const secondRoot = join(temp, 'second')
  await cp(pluginRoot, secondRoot, { recursive: true })
  const manifest = JSON.parse(await readFile(join(secondRoot, 'orca-plugin.json'), 'utf8'))
  manifest.id = 'second-viewer'
  manifest.name = 'Second Viewer'
  manifest.contributes.panels[0].title = 'Second Viewer'
  await writeFile(join(secondRoot, 'orca-plugin.json'), JSON.stringify(manifest))
  try {
    const workspacePath = await orcaPage.evaluate(
      async ({ workspaceId, pluginRoot, secondRoot }) => {
        const state = window.__store?.getState()
        if (!state) {
          throw new Error('store unavailable')
        }
        const workspace = Object.values(state.worktreesByRepo)
          .flat()
          .find((row) => row.id === workspaceId)
        if (!workspace) {
          throw new Error('workspace unavailable')
        }
        const settings = await window.api.settings.set({
          uiLanguage: 'en',
          pluginSystemEnabled: true,
          devPluginPaths: [pluginRoot, secondRoot]
        })
        window.__store?.setState({ settings })
        const plugin = (await window.api.plugins.refresh()).find(
          (row) => row.pluginKey === 'nowly-lab.selection-viewer'
        )
        if (!plugin?.consentFingerprint) {
          throw new Error('plugin unavailable')
        }
        await window.api.plugins.consent({
          pluginKey: plugin.pluginKey,
          reviewedFingerprint: plugin.consentFingerprint,
          decision: 'approve'
        })
        const second = (await window.api.plugins.refresh()).find(
          (row) => row.pluginKey === 'nowly-lab.second-viewer'
        )
        if (!second?.consentFingerprint) {
          throw new Error('second plugin unavailable')
        }
        await window.api.plugins.consent({
          pluginKey: second.pluginKey,
          reviewedFingerprint: second.consentFingerprint,
          decision: 'approve'
        })
        const result = await window.api.runtime.call({
          method: 'automation.create',
          params: {
            name: 'Viewer fixture',
            prompt: 'Synthetic viewer test only.',
            repo: `id:${workspace.repoId}`,
            workspace: `id:${workspaceId}`,
            workspaceMode: 'existing',
            agentId: 'codex',
            enabled: false,
            reuseSession: true,
            timezone: 'UTC',
            rrule: 'FREQ=DAILY',
            dtstart: Date.now(),
            precheck: { command: 'exit 1', timeoutSeconds: 10 }
          }
        })
        if (!result.ok) {
          throw new Error(result.error.message)
        }
        return workspace.path
      },
      { workspaceId, pluginRoot, secondRoot }
    )
    await writeFile(
      join(workspacePath, 'viewer-items.json'),
      JSON.stringify({
        items: [
          { id: 'a', title: '候補A' },
          { id: 'b', title: '候補B' }
        ]
      })
    )
    await orcaPage.getByRole('button', { name: 'New tab', exact: true }).first().click()
    await orcaPage.getByRole('menuitem', { name: 'Selection Viewer', exact: true }).click()
    await expect(orcaPage.getByText('Connect a dataset and automation')).toBeVisible()
    await orcaPage.getByLabel('Dataset file (relative to this workspace)').fill('viewer-items.json')
    await orcaPage.getByRole('combobox', { name: 'Automation', exact: true }).click()
    await orcaPage.getByRole('option', { name: 'Viewer fixture', exact: true }).click()
    await orcaPage.getByRole('button', { name: 'Save connection', exact: true }).click()
    const frame = orcaPage.frameLocator('iframe[title="Selection Viewer"]:visible')
    await expect(frame.getByRole('checkbox', { name: '候補A', exact: true })).toBeVisible()
    await frame.getByRole('checkbox', { name: '候補A', exact: true }).check()
    await frame.getByRole('checkbox', { name: '候補B', exact: true }).check()
    await frame.getByLabel('追加の指示').fill('選択された2件を処理してください')
    await frame.getByRole('button', { name: '実行', exact: true }).click()
    await expect(
      frame.getByRole('group', { name: '一括実行', exact: true }).getByRole('status')
    ).toContainText('受付済み:')
    await expect(orcaPage.getByRole('button', { name: 'Skipped', exact: true })).toBeVisible({
      timeout: 30000
    })
    const taskA = frame.getByRole('group', { name: '候補A', exact: true })
    await taskA.getByRole('textbox').fill('この1件だけを処理してください')
    await taskA.getByRole('button', { name: 'このタスクを実行', exact: true }).click()
    await expect(taskA.getByRole('status')).toContainText('受付済み:')
    await expect(orcaPage.getByRole('button', { name: 'Skipped', exact: true })).toHaveCount(2, {
      timeout: 30000
    })

    await expect(
      orcaPage.getByText('Recent runs — execution ending does not confirm task success.')
    ).toBeVisible()
    await orcaPage.screenshot({
      path: join(process.cwd(), '.superpowers/sdd/2026-09-19-custom-viewer/viewer.png')
    })
    await writeFile(
      join(workspacePath, 'viewer-items.json'),
      JSON.stringify({ items: [{ id: 'a', title: '候補A 更新' }] })
    )
    await frame.getByRole('button', { name: '実行', exact: true }).click()
    await expect(
      frame.getByRole('group', { name: '一括実行', exact: true }).getByRole('status')
    ).toContainText('data_changed')

    await frame.getByRole('button', { name: 'データを再読込', exact: true }).click()
    await expect(frame.getByRole('checkbox', { name: '候補A 更新', exact: true })).toBeVisible()
    // Reopening the same viewer reuses its tab; another plugin has an independent binding.
    await orcaPage.getByRole('button', { name: 'New tab', exact: true }).first().click()
    await orcaPage.getByRole('menuitem', { name: 'Selection Viewer', exact: true }).click()
    await expect(orcaPage.getByRole('menu')).toBeHidden()
    await expect(orcaPage.locator('iframe[title="Selection Viewer"]')).toHaveCount(1)
    await orcaPage.getByRole('button', { name: 'New tab', exact: true }).first().click()
    await orcaPage.getByRole('menuitem', { name: 'Second Viewer', exact: true }).click()
    await expect(orcaPage.getByText('Connect a dataset and automation')).toBeVisible()
    await orcaPage.getByRole('button', { name: 'Close tab', exact: true }).last().click()
    await expect(frame.getByRole('checkbox', { name: '候補A 更新', exact: true })).toBeVisible()
    const html = await readFile(join(pluginRoot, 'panel.html'), 'utf8')
    await writeFile(
      join(pluginRoot, 'panel.html'),
      html.replace('<body>', '<body><p>Viewer reloaded</p>')
    )
    await expect(frame.getByText('Viewer reloaded')).toBeVisible({ timeout: 15000 })
    await expect(frame.getByLabel('追加の指示')).toHaveValue('')
    await orcaPage.getByRole('button', { name: 'Close tab', exact: true }).last().click()
    await orcaPage.getByRole('button', { name: 'New tab', exact: true }).first().click()
    await orcaPage.getByRole('menuitem', { name: 'Selection Viewer', exact: true }).click()
    await expect(frame.getByRole('checkbox', { name: '候補A 更新', exact: true })).toBeVisible()
    // Folder workspaces retain their own dataset root and share the group's automation choices.
    await writeFile(
      join(temp, 'folder-items.json'),
      JSON.stringify({ items: [{ id: 'folder', title: 'Folder record' }] })
    )
    await orcaPage.evaluate(
      async ({ workspaceId, folderPath }) => {
        const state = window.__store?.getState()
        const repoId = Object.values(state?.worktreesByRepo ?? {})
          .flat()
          .find((row) => row.id === workspaceId)?.repoId
        if (!state || !repoId) {
          throw new Error('workspace unavailable')
        }
        const group = await window.api.projectGroups.create({
          name: 'Viewer group',
          parentPath: folderPath,
          createdFrom: 'manual'
        })
        await window.api.projectGroups.moveProject({ projectId: repoId, groupId: group.id })
        await state.fetchProjectGroups()
        const folder = await state.createFolderWorkspace({
          projectGroupId: group.id,
          name: 'Viewer folder',
          folderPath
        })
        if (!folder) {
          throw new Error('folder unavailable')
        }
        state.setActiveWorktree(`folder:${folder.id}`)
      },
      { workspaceId, folderPath: temp }
    )
    await orcaPage.getByRole('button', { name: 'New tab', exact: true }).first().click()
    await orcaPage.getByRole('menuitem', { name: 'Selection Viewer', exact: true }).click()
    await expect(orcaPage.getByText('Connect a dataset and automation')).toBeVisible()
    await orcaPage.getByLabel('Dataset file (relative to this workspace)').fill('folder-items.json')
    await orcaPage.getByRole('combobox', { name: 'Automation', exact: true }).click()
    await orcaPage.getByRole('option', { name: 'Viewer fixture', exact: true }).click()
    await orcaPage.getByRole('button', { name: 'Save connection', exact: true }).click()
    await expect(frame.getByRole('checkbox', { name: 'Folder record', exact: true })).toBeVisible()
    await orcaPage.evaluate(async () => {
      await window.api.plugins.setEnabled({
        pluginKey: 'nowly-lab.selection-viewer',
        enabled: false
      })
    })
    await expect(
      orcaPage.getByText('This plugin panel is no longer available.').filter({ visible: true })
    ).toBeVisible()
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
