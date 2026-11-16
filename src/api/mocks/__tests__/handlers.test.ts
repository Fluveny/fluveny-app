import { mockResponse, mswPath } from '../handlers';
import { mockRoutes } from '../routes';
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
});
