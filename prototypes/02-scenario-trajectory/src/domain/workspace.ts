import type { Trajectory, Workspace } from './types.ts'

export function promoteToMaster(workspace: Workspace, trajectoryId: string): Workspace {
  const index = workspace.alternatives.findIndex((t) => t.id === trajectoryId)
  if (index === -1) {
    throw new Error(`No Alternative with id "${trajectoryId}" in this Workspace`)
  }
  const promoted = workspace.alternatives[index]!
  const remaining = workspace.alternatives.filter((_, i) => i !== index)
  const alternatives: Trajectory[] = [...remaining, workspace.master]
  return { master: promoted, alternatives }
}
