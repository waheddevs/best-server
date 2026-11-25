import {
  Kind,
  type FieldNode,
  type GraphQLResolveInfo,
  type SelectionSetNode,
} from 'graphql';

const SAVE_STATE_FIELDS = new Set([
  '__typename',
  'id',
  'status',
  'serverTime',
  'answers',
  'notes',
]);

// Keep the existing StudentAttempt contract. Load test content only if requested.
// Treat directives conservatively: a skipped content field may cause a full load,
// but aliases or fragments can never make us omit a requested field.
export function requestsFullSavedAttempt(
  info: Pick<GraphQLResolveInfo, 'fieldNodes' | 'fragments'>,
): boolean {
  const payloadFields = collectFields(
    info.fieldNodes.flatMap((node) =>
      node.selectionSet ? [node.selectionSet] : [],
    ),
    info.fragments,
  );
  return payloadFields.some(
    (field) =>
      field.name.value === 'attempt' &&
      field.selectionSet !== undefined &&
      collectFields([field.selectionSet], info.fragments).some(
        (attemptField) => !SAVE_STATE_FIELDS.has(attemptField.name.value),
      ),
  );
}

function collectFields(
  selectionSets: readonly SelectionSetNode[],
  fragments: GraphQLResolveInfo['fragments'],
): FieldNode[] {
  const pending = [...selectionSets];
  const visited = new Set<string>();
  const fields: FieldNode[] = [];
  for (
    let selectionSet = pending.pop();
    selectionSet !== undefined;
    selectionSet = pending.pop()
  ) {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) fields.push(selection);
      else if (selection.kind === Kind.INLINE_FRAGMENT)
        pending.push(selection.selectionSet);
      else if (!visited.has(selection.name.value)) {
        visited.add(selection.name.value);
        const fragment = fragments[selection.name.value];
        if (fragment !== undefined) pending.push(fragment.selectionSet);
      }
    }
  }
  return fields;
}
