/**
 * Pins the rule-engine enums against the INSTALLED @actual-app/api SDK's
 * own source text — not a hand-duplicated copy of it. Each assertion reads
 * node_modules/@actual-app/api/dist/index.js and extracts the same
 * definitions cited (by line number) in src/validation/constants.js and the
 * Phase E report (TYPE_INFO/FIELD_INFO/ACTION_OPS). If the SDK moves or
 * renames these internals, the anchor lookup throws — loud, not a silent
 * pass against a list nobody re-verified.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  RULE_FIELDS,
  RULE_CONDITION_OPS,
  RULE_ACTION_OPS,
  RULE_STAGES,
  SCOPES,
  QUERY_TABLES,
  PAYEE_NAME_NORMALIZATIONS,
} from '../../src/validation/constants.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sdkPath = path.resolve(dirname, '../../node_modules/@actual-app/api/dist/index.js');
const sdkSource = fs.readFileSync(sdkPath, 'utf8');

/** Slices `source` from `startAnchor` up to the next `endAnchor` — throws (not empty-string) if either is missing, so a moved/renamed SDK internal fails loud. */
const sliceBetween = (source, startAnchor, endAnchor) => {
  const startIdx = source.indexOf(startAnchor);
  if (startIdx === -1) {
    throw new Error(
      `Anchor not found in @actual-app/api/dist/index.js: ${JSON.stringify(startAnchor)}. ` +
      'The SDK rule engine internals moved — re-derive src/validation/constants.js by hand ' +
      'and update these anchors.'
    );
  }
  const endIdx = source.indexOf(endAnchor, startIdx + startAnchor.length);
  if (endIdx === -1) {
    throw new Error(`End anchor ${JSON.stringify(endAnchor)} not found after ${JSON.stringify(startAnchor)}.`);
  }
  return source.slice(startIdx, endIdx);
};

const extractQuotedStrings = (text) => Array.from(text.matchAll(/"([^"]+)"/g)).map((m) => m[1]);

describe('rule engine enums, derived live from the installed @actual-app/api SDK', () => {
  it('RULE_FIELDS matches every FIELD_INFO key (dist/index.js)', () => {
    const fieldInfoBlock = sliceBetween(sdkSource, 'var FIELD_INFO = {', 'var fieldInfo = FIELD_INFO;');
    // Top-level FIELD_INFO entries only: "<name>: {" at any indentation,
    // one-line ({ type: "..." }) or multi-line — nested keys inside an
    // entry (type/disallowedOps/internalOps) are never followed by `{`.
    const fieldNames = Array.from(fieldInfoBlock.matchAll(/^\s*(\w+): \{/gm)).map((m) => m[1]);

    expect(fieldNames.length).toBeGreaterThan(0);
    expect(RULE_FIELDS.slice().sort()).toEqual(fieldNames.slice().sort());
  });

  it('RULE_CONDITION_OPS matches the union of TYPE_INFO[*].ops (dist/index.js)', () => {
    const typeInfoBlock = sliceBetween(sdkSource, 'var TYPE_INFO = {', 'var FIELD_INFO = {');
    const opsBlocks = Array.from(typeInfoBlock.matchAll(/ops:\s*\[([\s\S]*?)\]/g)).map((m) => m[1]);
    expect(opsBlocks.length).toBeGreaterThan(0); // one per field type (date/id/saved/string/number/boolean)

    const sdkOps = new Set();
    opsBlocks.forEach((block) => extractQuotedStrings(block).forEach((op) => sdkOps.add(op)));

    expect(sdkOps.size).toBeGreaterThan(0);
    expect(RULE_CONDITION_OPS.slice().sort()).toEqual(Array.from(sdkOps).sort());
  });

  it('does not include the internal-only "and" condition op', () => {
    // 'and' is real in the SDK (FIELD_INFO.category/category_group
    // .internalOps, validated via isValidOp()) but only ever synthesised
    // internally when normalising a category-is-empty condition — never
    // listed in any TYPE_INFO[*].ops array, so the assertion above already
    // can't pick it up. This just documents the exclusion explicitly.
    const internalOpsBlock = sliceBetween(sdkSource, 'var FIELD_INFO = {', 'var fieldInfo = FIELD_INFO;');
    expect(internalOpsBlock).toContain('internalOps');
    expect(internalOpsBlock).toMatch(/internalOps:.*new Set\(\["and"\]\)/);
    expect(RULE_CONDITION_OPS).not.toContain('and');
  });

  it('RULE_ACTION_OPS matches ACTION_OPS exactly, in order (dist/index.js)', () => {
    const actionOpsBlock = sliceBetween(sdkSource, 'var ACTION_OPS = [', '];');
    const sdkActionOps = extractQuotedStrings(actionOpsBlock);

    expect(sdkActionOps.length).toBeGreaterThan(0);
    expect(RULE_ACTION_OPS).toEqual(sdkActionOps);
  });

  // Small hand-asserted guard, kept alongside the SDK-derived assertions
  // above — NOT a substitute for them, just catches an accidental local
  // edit between SDK-verification runs.
  it('guards the list lengths against an accidental local edit', () => {
    expect(RULE_FIELDS).toHaveLength(14);
    expect(RULE_CONDITION_OPS).toHaveLength(17);
    expect(RULE_ACTION_OPS).toHaveLength(6);
  });
});

describe('other constants (not derived from the @actual-app/api rule engine)', () => {
  it('RULE_STAGES matches APIRuleEntity[\'stage\'] (api-models.d.ts:71-73)', () => {
    expect(RULE_STAGES.slice().sort()).toEqual(['default', 'post', 'pre']);
  });

  it('SCOPES is the four OAuth client scopes (this wrapper\'s own concept, not an SDK entity)', () => {
    expect(SCOPES).toEqual(['read', 'write', 'admin', 'api']);
  });

  it('QUERY_TABLES is the same nine-table whitelist as before', () => {
    expect(QUERY_TABLES).toEqual([
      'transactions', 'accounts', 'categories', 'category_groups',
      'payees', 'schedules', 'rules', 'budgets', 'budget_months',
    ]);
  });

  it('PAYEE_NAME_NORMALIZATIONS has the two import-opts values', () => {
    expect(PAYEE_NAME_NORMALIZATIONS).toEqual(['title-case', 'original']);
  });
});
