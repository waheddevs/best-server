import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kind, parse, type GraphQLResolveInfo } from 'graphql';

import { requestsFullSavedAttempt } from '../src/components/attempts/attempt-save-selection';

function selection(
  source: string,
): Pick<GraphQLResolveInfo, 'fieldNodes' | 'fragments'> {
  const document = parse(source);
  return {
    fieldNodes: document.definitions.flatMap((definition) =>
      definition.kind === Kind.OPERATION_DEFINITION
        ? definition.selectionSet.selections.filter(
            (node) => node.kind === Kind.FIELD,
          )
        : [],
    ),
    fragments: Object.fromEntries(
      document.definitions.flatMap((definition) =>
        definition.kind === Kind.FRAGMENT_DEFINITION
          ? [[definition.name.value, definition]]
          : [],
      ),
    ),
  };
}

void test('answer and note autosaves need only saved state, including aliases', () => {
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation {
    saved: saveAttemptAnswer { a: attempt {
      id status serverTime answers { questionId selectedOptionId savedAt } notes { sectionId text }
    } }
  }`),
    ),
    false,
  );
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation {
    saveAttemptSectionNote { attempt { id notes { sectionId text savedAt } } }
  }`),
    ),
    false,
  );
});

void test('nested payload/attempt fragments and inline fragments retain full-content requests', () => {
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation { saveAttemptAnswer { ...Payload } }
    fragment Payload on SaveAttemptAnswerPayload { attempt { ...State ... on StudentAttempt { q: questions { id } } } }
    fragment State on StudentAttempt { id status answers { questionId } }
  `),
    ),
    true,
  );
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation { saveAttemptAnswer { ...Payload } }
    fragment Payload on SaveAttemptAnswerPayload { attempt { ...State } }
    fragment State on StudentAttempt { id status answers { questionId } }
  `),
    ),
    false,
  );
});

void test('merged field nodes and repeated attempt selections cannot hide content', () => {
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation {
    saveAttemptAnswer { attempt { id } }
    saveAttemptAnswer { attempt { sections { id } } }
  }`),
    ),
    true,
  );
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation {
    saveAttemptAnswer { attempt { id } attempt { result { percentage } } }
  }`),
    ),
    true,
  );
});

void test('directives fall back conservatively and cyclic fragments do not loop', () => {
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation {
    saveAttemptAnswer { attempt { id title @skip(if: true) } }
  }`),
    ),
    true,
  );
  assert.equal(
    requestsFullSavedAttempt(
      selection(`mutation { saveAttemptAnswer { ...A } }
    fragment A on SaveAttemptAnswerPayload { ...B }
    fragment B on SaveAttemptAnswerPayload { ...A attempt { id } }
  `),
    ),
    false,
  );
});
