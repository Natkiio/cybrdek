// Past versions of a character, so an overwritten edit can be got back (#52).

import type { Character } from '#lib/engine/types.ts';
import { exportCharacter, parseCharacterFile } from '#lib/storage/backup.ts';
import { supabase } from '#lib/supabase/client.ts';

export interface CharacterVersion {
	versionId: number;
	savedAt: number;
	character: Character;
}

export async function listVersions(id: string): Promise<CharacterVersion[] | { error: string }> {
	const { data, error } = await supabase()
		.from('character_versions')
		.select('version_id, data, updated_at')
		.eq('character_id', id)
		.order('version_id', { ascending: false })
		.abortSignal(AbortSignal.timeout(10000));
	if (error || !data) return { error: 'Past versions need a connection.' };
	return data.flatMap((row) => {
		const result = parseCharacterFile(exportCharacter(row.data as Character));
		return result.ok ? [{ versionId: row.version_id, savedAt: row.updated_at, character: result.character }] : [];
	});
}
