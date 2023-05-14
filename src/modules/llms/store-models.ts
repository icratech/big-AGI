import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { persist } from 'zustand/middleware';

import { ModelVendorId } from './vendors-registry';
import { SourceSetupLocalAI } from './localai/vendor';
import { SourceSetupOpenAI } from './openai/vendor';


/**
 * Model - a LLM with certain capabilities, referenced by ID, and with a link to the source
 */
export interface DLLM {
  uid: DLLMId; // unique, saved in chats
  _sourceId: DModelSourceId;
  _sourceModelId: string;
  label: string;

  // capabilities
  contextWindowSize: number;
  canStream: boolean;
  canChat: boolean;

  // optional
  description?: string;
  tradeoff?: string;
  created?: number;
}

type DLLMId = string;

/**
 * ModelSource - a source of models, e.g. a vendor
 *
 * Has all the parameters for accessing a list of models, and to call generation functions
 */
export interface DModelSource {
  id: DModelSourceId;
  label: string;

  // foreign keys
  vendorId: ModelVendorId;

  // source-specific
  setup?: Partial<SourceSetupOpenAI> | Partial<SourceSetupLocalAI>;
}

export type DModelSourceId = string;

export function findUniqueSourceId(vendorId: ModelVendorId, otherSources: DModelSource[]): { id: string, count: number } {
  let id: DModelSourceId = vendorId;
  let count = 0;
  while (otherSources.find(source => source.id === id)) {
    count++;
    id = `${vendorId}-${count}`;
  }
  return { id, count };
}


/**
 * ModelsStore - a store for models and sources
 */
interface ModelsStore {
  // Models
  llms: DLLM[];
  addLLMs: (models: DLLM[]) => void;
  removeLLM: (uid: DLLMId) => void;

  // Sources
  sources: DModelSource[];
  addSource: (source: DModelSource) => void;
  removeSource: (sourceId: DModelSourceId) => void;
  updateSourceSetup: <T>(sourceId: DModelSourceId, setup: Partial<T>) => void;
}

export const useModelsStore = create<ModelsStore>()(
  persist(
    (set) => ({

      llms: [],

      addLLMs: (models: DLLM[]) =>
        set(state => ({
          // remove existing models with the same uid
          llms: state.llms.filter(model => !models.find((m) => m.uid === model.uid)).concat(models),
        })),

      removeLLM: (uid: DLLMId) =>
        set((state) => ({ llms: state.llms.filter((model) => model.uid !== uid) })),


      sources: [],

      addSource: (source: DModelSource) =>
        set(state => ({ sources: [...state.sources, source] })),

      removeSource: (sourceId: DModelSourceId) =>
        set(state => ({
          sources: state.sources.filter((source) => source.id !== sourceId),
          llms: state.llms.filter((model) => model._sourceId !== sourceId),
        })),

      updateSourceSetup: <T>(sourceId: DModelSourceId, setup: Partial<T>) =>
        set(state => ({
          sources: state.sources.map((source: DModelSource): DModelSource =>
            source.id === sourceId
              ? {
                ...source,
                setup: { ...source.setup, ...setup },
              } : source,
          ),
        })),

    }),
    {
      name: 'app-models',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // remove models with unknown source
          //   state.llms = state.llms.filter((llm) => state.sources.find((source) => source.id === llm._sourceId));
        }
      },
    }),
);


/**
 * Hook used for Source-specific setup
 */
export function useSourceSetup<T>(sourceId: DModelSourceId, normalizer: (partialSetup?: Partial<T>) => T): { setup: T; updateSetup: (partialSetup: Partial<T>) => void } {

  // invalidate when the setup changes
  const { setup, updateSourceSetup } = useModelsStore(state => {
    const modelSource = state.sources.find((source) => source.id === sourceId);
    return {
      setup: normalizer(modelSource?.setup as Partial<T> | undefined),
      updateSourceSetup: state.updateSourceSetup,
    };
  }, shallow);

  // convenience function for this source
  const updateSetup = (partialSetup: Partial<T>) => updateSourceSetup<T>(sourceId, partialSetup);
  return { setup, updateSetup };
}


/**
 * Joined list of models
 */
export function useJoinedLLMs(): { model: DLLM, sourceLabel: string, vendorId: ModelVendorId | null }[] {
  const llms = useModelsStore(state => state.llms);
  return llms.map((model) => {
    const modelSource = useModelsStore.getState().sources.find((source) => source.id === model._sourceId);
    return {
      model: model,
      sourceLabel: modelSource?.label ?? 'Unknown',
      vendorId: modelSource?.vendorId ?? null,
    };
  });
}
