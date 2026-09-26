import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Vocabulary {
  id: string;
  key: string;
  label: string;
  description: string | null;
  scope: string;
  worldId: string | null;
  active: boolean;
  version: number;
}

export interface VocabularyOption {
  id: string;
  vocabularyId: string;
  key: string;
  label: string;
  description: string | null;
  worldId: string | null;
  active: boolean;
  version: number;
  displayOrder: number;
}

export interface VocabularyRegister {
  vocabularies: Vocabulary[];
  options: VocabularyOption[];
}

const ROOT = "/v1/editorial/vocabulary-management";

export function useVocabularyManagement(worldId: string | null) {
  return useQuery({
    queryKey: ["editorial-vocabulary-management", worldId],
    queryFn: () => apiFetch<VocabularyRegister>(
      `/v1/editorial/vocabularies?world_id=${encodeURIComponent(worldId!)}`,
    ),
    enabled: Boolean(worldId),
  });
}

type Kind = "vocabularies" | "options";
type CreateInput = { kind: Kind; worldId: string; vocabularyId?: string; key: string; label: string; description: string };
type UpdateInput = { kind: Kind; id: string; worldId: string; expectedVersion: number; label?: string; description?: string; active?: boolean };

function useRefreshOnWrite() {
  const client = useQueryClient();
  return (worldId: string) => Promise.all([
    client.invalidateQueries({ queryKey: ["editorial-vocabularies", worldId] }),
    client.invalidateQueries({ queryKey: ["editorial-vocabulary-management", worldId] }),
  ]);
}

export function useCreateVocabularyEntry() {
  const refresh = useRefreshOnWrite();
  return useMutation({
    mutationFn: ({ kind, worldId, vocabularyId, key, label, description }: CreateInput) =>
      apiFetch<{ vocabulary?: Vocabulary; option?: VocabularyOption }>(`${ROOT}/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId, ...(kind === "options" ? { vocabulary_id: vocabularyId } : {}),
          key, label, ...(description ? { description } : {}),
        }),
      }),
    onSuccess: (_result, { worldId }) => refresh(worldId),
  });
}

export function useUpdateVocabularyEntry() {
  const refresh = useRefreshOnWrite();
  return useMutation({
    mutationFn: ({ kind, id, worldId, expectedVersion, label, description, active }: UpdateInput) =>
      apiFetch<{ vocabulary?: Vocabulary; option?: VocabularyOption }>(`${ROOT}/${kind}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          world_id: worldId,
          expected_version: expectedVersion,
          ...(label !== undefined ? { label } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(active !== undefined ? { active } : {}),
        }),
      }),
    onSuccess: (_result, { worldId }) => refresh(worldId),
  });
}