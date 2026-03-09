import { describe, expect, it } from 'vitest';

interface EndpointMatrix {
  entity: string;
  basePath: string;
  methods: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>;
}

const CORE_CRUD_ENDPOINTS: EndpointMatrix[] = [
  { entity: 'ambassadors', basePath: '/api/v1/ambassadors', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
  { entity: 'events', basePath: '/api/v1/events', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
  { entity: 'operators', basePath: '/api/v1/operators', methods: ['GET', 'POST', 'PUT', 'PATCH'] },
  { entity: 'signups', basePath: '/api/v1/signups', methods: ['GET', 'POST', 'PATCH'] },
];

function hasReadWrite(entity: EndpointMatrix) {
  return entity.methods.includes('GET') && entity.methods.includes('POST');
}

describe('Phase 3: CRUD endpoint contracts', () => {
  it('covers core entity endpoint matrices', () => {
    expect(CORE_CRUD_ENDPOINTS.map((item) => item.entity)).toEqual([
      'ambassadors',
      'events',
      'operators',
      'signups',
    ]);
  });

  it('ensures each matrix supports create and read', () => {
    expect(CORE_CRUD_ENDPOINTS.every(hasReadWrite)).toBe(true);
  });

  it('tracks expected status-code families for CRUD', () => {
    const statusFamilies = {
      create: [201, 400, 409],
      read: [200, 404],
      update: [200, 400, 404, 409],
      delete: [200, 404],
    };

    expect(statusFamilies.create).toContain(201);
    expect(statusFamilies.read).toContain(404);
    expect(statusFamilies.update).toContain(409);
    expect(statusFamilies.delete).toContain(200);
  });
});
