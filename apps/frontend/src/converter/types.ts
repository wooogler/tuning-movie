export interface DataBinding {
  path: string;
}

export interface IteratorBinding {
  each: string;
  template: string;
}

export interface StateBinding {
  path: string;
  op?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'notEmpty' | 'truthy';
  value?: unknown;
}

export interface Action {
  type: 'navigate' | 'store' | 'api' | 'setState';
  payload?: Record<string, unknown>;
}

export interface Component {
  id: string;
  type: string;
  children?: string[] | IteratorBinding;
  props?: Record<string, unknown>;
  data?: DataBinding;
  when?: StateBinding;
}

export type StateModel = Record<string, unknown>;

export interface UISpec {
  surface: string;
  components: Component[];
  dataModel: Record<string, unknown>;
  state?: StateModel;
  actions?: Record<string, Action>;
}
