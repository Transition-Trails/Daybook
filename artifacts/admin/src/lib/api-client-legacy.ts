/**
 * Transitional catalog facade for the pre-rebuild admin screens.
 *
 * The shared client is generated from the current OpenAPI contract. A small
 * group of older catalog screens still consume the pre-rebuild string-ID and
 * relation-array shapes, so this facade preserves their compile-time contract
 * while delegating every request to the generated runtime client. New screens
 * should use @workspace/api-client-react directly after the legacy screens are
 * migrated to the current catalog contract.
 */
import * as generated from "../../../../lib/api-client-react/src/index.ts";

export * from "../../../../lib/api-client-react/src/index.ts";

type LegacyRecord = Record<string, any>;

export interface Edition extends LegacyRecord {
  id: string;
  name: string;
  status: generated.CatalogStatus;
}

export interface Theme extends LegacyRecord {
  id: string;
  name: string;
  status: generated.CatalogStatus;
}

export interface StickerPack extends LegacyRecord {
  id: string;
  name: string;
  status: generated.CatalogStatus;
}

export interface Insert extends LegacyRecord {
  id: string;
  name: string;
  status: generated.CatalogStatus;
}

export interface RelatedProduct extends LegacyRecord {
  id: string;
  name: string;
  status: generated.CatalogStatus;
}

export type EditionInput = LegacyRecord;
export type EditionUpdate = LegacyRecord;
export type InsertInput = LegacyRecord;
export type InsertUpdate = LegacyRecord;
export type StickerPackInput = LegacyRecord;
export type StickerPackUpdate = LegacyRecord;
export type RelatedProductInput = LegacyRecord;
export type RelatedProductUpdate = LegacyRecord;

interface LegacyQueryResult<T> extends LegacyRecord {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  refetch: (...args: any[]) => Promise<any>;
}

interface LegacyMutationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
  onSettled?: () => void;
}

interface LegacyMutationResult<T> extends LegacyRecord {
  isPending: boolean;
  mutate: (variables: any, options?: LegacyMutationOptions<T>) => void;
}

type LegacyQuery<T> = (...args: any[]) => LegacyQueryResult<T>;
type LegacyMutation<T> = (...args: any[]) => LegacyMutationResult<T>;
type LegacyKey = (...args: any[]) => readonly unknown[];

export const useListEditions = generated.useListEditions as unknown as LegacyQuery<Edition[]>;
export const useListThemes = generated.useListThemes as unknown as LegacyQuery<Theme[]>;
export const useListStickerPacks = generated.useListStickerPacks as unknown as LegacyQuery<StickerPack[]>;
export const useListInserts = generated.useListInserts as unknown as LegacyQuery<Insert[]>;
export const useListProducts = generated.useListProducts as unknown as LegacyQuery<RelatedProduct[]>;

export const useGetEdition = generated.useGetEdition as unknown as LegacyQuery<Edition>;
export const useCreateEdition = generated.useCreateEdition as unknown as LegacyMutation<Edition>;
export const useUpdateEdition = generated.useUpdateEdition as unknown as LegacyMutation<Edition>;
export const useDeleteEdition = generated.useDeleteEdition as unknown as LegacyMutation<void>;
export const getGetEditionQueryKey = generated.getGetEditionQueryKey as unknown as LegacyKey;
export const getListEditionsQueryKey = generated.getListEditionsQueryKey as unknown as LegacyKey;

export const useGetInsert = generated.useGetInsert as unknown as LegacyQuery<Insert>;
export const useCreateInsert = generated.useCreateInsert as unknown as LegacyMutation<Insert>;
export const useUpdateInsert = generated.useUpdateInsert as unknown as LegacyMutation<Insert>;
export const useDeleteInsert = generated.useDeleteInsert as unknown as LegacyMutation<void>;
export const getGetInsertQueryKey = generated.getGetInsertQueryKey as unknown as LegacyKey;
export const getListInsertsQueryKey = generated.getListInsertsQueryKey as unknown as LegacyKey;

export const useGetStickerPack = generated.useGetStickerPack as unknown as LegacyQuery<StickerPack>;
export const useCreateStickerPack = generated.useCreateStickerPack as unknown as LegacyMutation<StickerPack>;
export const useUpdateStickerPack = generated.useUpdateStickerPack as unknown as LegacyMutation<StickerPack>;
export const useDeleteStickerPack = generated.useDeleteStickerPack as unknown as LegacyMutation<void>;
export const getGetStickerPackQueryKey = generated.getGetStickerPackQueryKey as unknown as LegacyKey;
export const getListStickerPacksQueryKey = generated.getListStickerPacksQueryKey as unknown as LegacyKey;

export const useGetProduct = generated.useGetProduct as unknown as LegacyQuery<RelatedProduct>;
export const useCreateProduct = generated.useCreateProduct as unknown as LegacyMutation<RelatedProduct>;
export const useUpdateProduct = generated.useUpdateProduct as unknown as LegacyMutation<RelatedProduct>;
export const useDeleteProduct = generated.useDeleteProduct as unknown as LegacyMutation<void>;
export const getGetProductQueryKey = generated.getGetProductQueryKey as unknown as LegacyKey;
export const getListProductsQueryKey = generated.getListProductsQueryKey as unknown as LegacyKey;

export const useAiChat = generated.useAiChat as unknown as LegacyMutation<{
  text: string;
  content: string;
  provider: string;
}>;