import { mockResponse, mswPath } from '../handlers';
import { MOCK_CREATED, mockRoutes, resetMockStudents } from '../routes';
import { start } from '../start';

describe('mswPath()', () => {
  it('casa qualquer base e troca {param} por :param', () => {
    expect(mswPath('/x/{id}')).toBe('*/x/:id');
    expect(mswPath('/api/v1/meta')).toBe('*/api/v1/meta');
  });
});

describe('start() no nativo', () => {
  it('intercepta o fetch da URL absoluta da API e responde com o mock', async () => {
    // O preset do React Native troca o fetch por um mock vazio; aqui ele faz o papel da rede.
    global.fetch = jest.fn(async () => new Response('rede', { status: 599 }));
    await start();

    const response = await fetch('http://10.0.2.2:8080/api/v1/meta');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      mockRoutes['/api/v1/meta'].get(new Request('http://10.0.2.2:8080/api/v1/meta')),
    );
  });
});

describe('mockResponse()', () => {
  it('MockProblem vira problem+json com o status e o code', async () => {
    const response = await mockResponse(
      mockRoutes['/api/v1/visitor/attempts'].post,
      new Request('http://mock/api/v1/visitor/attempts', {
        method: 'POST',
        body: JSON.stringify({ activityKey: 'atividade-que-nao-existe' }),
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('mock sem corpo (eventos do Visitante, 1.20) vira 202 sem corpo', async () => {
    const response = await mockResponse(
      mockRoutes['/api/v1/visitor/events'].post,
      new Request('http://mock/api/v1/visitor/events', {
        method: 'POST',
        body: JSON.stringify({ type: 'VISITOR_SESSION_STARTED', deviceId: '0b6a3f0e-4c1d-4e2a-9b3c-5d6e7f809a1b' }),
      }),
    );
    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe('');
  });
});

describe('mockResponse() com status (2.1)', () => {
  it('o cadastro responde 201 com o corpo', async () => {
    resetMockStudents();
    expect(MOCK_CREATED.has('POST /api/v1/auth/signup')).toBe(true);
    const response = await mockResponse(
      mockRoutes['/api/v1/auth/signup'].post,
      new Request('http://mock/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'X-Fluveny-Client': 'web' },
        body: JSON.stringify({
          email: 'ana@exemplo.test',
          password: 'segredo123',
          birthDate: '1990-05-20',
          acceptedTermsVersion: '0.2',
          acceptedPrivacyVersion: '0.3',
        }),
      }),
      201,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { student: { email: 'ana@exemplo.test' } } });
  });
});
