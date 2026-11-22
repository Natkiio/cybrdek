import { supabase } from '#lib/supabase/client.ts';
import type { Architecture, ArchitectureView } from './architecture.ts';
export interface NetError { error: string; conflict?: boolean }
export async function readArchitectures(campaign: string): Promise<ArchitectureView | NetError> {
 const { data, error } = await supabase().rpc('campaign_net_architectures', { campaign }).abortSignal(AbortSignal.timeout(10_000));
 return error || !data ? { error: 'Architectures unavailable. Check your connection and campaign membership.' } : data;
}
export async function saveArchitecture(campaign: string, id: string | null, revision: number, snapshot: Architecture): Promise<ArchitectureView | NetError> {
 const { data, error } = await supabase().rpc('save_net_architecture', { campaign, architecture_id: id, expected_revision: revision, snapshot }).abortSignal(AbortSignal.timeout(10_000));
 return error || !data ? { error: error?.code === '40001' ? 'This Architecture changed elsewhere. Refresh and review before saving again.' : 'Could not save. Check your connection and GM permissions.', conflict: error?.code === '40001' } : data;
}
export async function deleteArchitecture(campaign: string, id: string, revision: number): Promise<ArchitectureView | NetError> {
 const { data, error } = await supabase().rpc('delete_net_architecture', { campaign, architecture_id: id, expected_revision: revision }).abortSignal(AbortSignal.timeout(10_000));
 return error || !data ? { error: error?.code === '40001' ? 'This Architecture changed elsewhere. Refresh before deleting.' : 'Could not delete. Check your connection and GM permissions.', conflict: error?.code === '40001' } : data;
}
