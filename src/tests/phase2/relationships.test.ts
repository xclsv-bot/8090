import { describe, expect, it } from 'vitest';

interface Entity {
  id: string;
  parentId?: string;
}

function hasReferentialIntegrity(children: Entity[], parents: Entity[]) {
  const parentIds = new Set(parents.map((parent) => parent.id));
  return children.every((child) => !child.parentId || parentIds.has(child.parentId));
}

function cascadeDelete(parentId: string, children: Entity[]) {
  return children.filter((child) => child.parentId !== parentId);
}

describe('Phase 2: Relationship integrity', () => {
  it('enforces foreign key-style parent existence', () => {
    const parents = [{ id: 'event-1' }, { id: 'event-2' }];
    const signups = [
      { id: 'signup-1', parentId: 'event-1' },
      { id: 'signup-2', parentId: 'event-2' },
    ];

    expect(hasReferentialIntegrity(signups, parents)).toBe(true);
  });

  it('detects broken references', () => {
    const parents = [{ id: 'event-1' }];
    const assignments = [{ id: 'assignment-1', parentId: 'event-404' }];

    expect(hasReferentialIntegrity(assignments, parents)).toBe(false);
  });

  it('simulates cascade deletion behavior', () => {
    const children = [
      { id: 'child-1', parentId: 'event-1' },
      { id: 'child-2', parentId: 'event-2' },
    ];

    const remaining = cascadeDelete('event-1', children);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].parentId).toBe('event-2');
  });
});
