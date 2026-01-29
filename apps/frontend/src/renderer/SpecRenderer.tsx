import type { ReactNode } from 'react';
import type { UISpec, IteratorBinding } from '../converter/types';
import { resolveData } from './resolveData';
import { getComponent } from './registry';

export interface SpecRendererProps {
  spec: UISpec;
  onAction?: (actionName: string, data?: unknown) => void;
}

export function SpecRenderer({ spec, onAction }: SpecRendererProps) {
  const componentMap = new Map(spec.components.map((c) => [c.id, c]));

  function renderComponent(
    id: string,
    contextData?: Record<string, unknown>,
  ): ReactNode {
    const comp = componentMap.get(id);
    if (!comp) return null;

    const dataContext = contextData ?? spec.dataModel;

    // Resolve data binding
    const resolvedData = comp.data
      ? resolveData(comp.data, dataContext)
      : undefined;

    // Render children
    let renderedChildren: ReactNode = null;

    if (Array.isArray(comp.children)) {
      // Static children: ["child1", "child2"]
      renderedChildren = comp.children.map((childId) =>
        renderComponent(childId),
      );
    } else if (comp.children && isIteratorBinding(comp.children)) {
      // Iterator children: { each: "/movies", template: "card_tpl" }
      const iteratorBinding = comp.children;
      const items = resolveData(
        { path: iteratorBinding.each },
        spec.dataModel,
      ) as unknown[];
      if (Array.isArray(items)) {
        renderedChildren = items.map((item, i) =>
          renderComponent(iteratorBinding.template, {
            ...spec.dataModel,
            _item: item,
            _index: i,
          }),
        );
      }
    }

    // Look up React component from registry
    const ReactComponent = getComponent(comp.type);
    if (!ReactComponent) {
      console.warn(`Unknown component type: ${comp.type}`);
      return null;
    }

    return (
      <ReactComponent
        key={comp.id}
        data={resolvedData}
        onAction={onAction}
        {...comp.props}
      >
        {renderedChildren}
      </ReactComponent>
    );
  }

  return <>{renderComponent('root')}</>;
}

function isIteratorBinding(
  children: string[] | IteratorBinding,
): children is IteratorBinding {
  return (
    typeof children === 'object' &&
    !Array.isArray(children) &&
    'each' in children
  );
}
