import * as sentry from '../../observability/sentry';
import { ApiError } from '../client';
import { NETWORK_ERROR } from '../errors';
import { reportMetaError, resetMetaErrorReport, versionStatus } from '../meta';
import { isBelow, parseVersion } from '../semver';

jest.mock('../../observability/sentry', () => ({ captureError: jest.fn() }));

describe('versionStatus', () => {
  it('checking enquanto o /meta não respondeu', () => {
    expect(versionStatus(undefined, true, '1.0.0')).toBe('checking');
  });

  it('ok quando o /meta falhou (sem dados e sem pendência)', () => {
    expect(versionStatus(undefined, false, '1.0.0')).toBe('ok');
  });

  it('outdated só abaixo do mínimo', () => {
    expect(versionStatus({ minAppVersion: '2.0.0', activityTypes: [] }, false, '1.0.0')).toBe('outdated');
    expect(versionStatus({ minAppVersion: '1.0.0', activityTypes: [] }, false, '1.0.0')).toBe('ok');
  });

  it.each([
    ['sem minAppVersion', {}],
    ['minAppVersion número', { minAppVersion: 99 }],
    ['minAppVersion nulo', { minAppVersion: null }],
    ['data nulo', null],
  ])('/meta malformado (%s) não bloqueia nem quebra', (_, meta) => {
    expect(versionStatus(meta as never, false, '0.1.0')).toBe('ok');
  });
});

describe('semver aceita só string', () => {
  it.each([99, null, undefined, {}, ['1', '0', '0']])('%p não é versão', (value) => {
    expect(parseVersion(value)).toBeNull();
    expect(isBelow('0.1.0', value)).toBe(false);
  });
});

describe('reportMetaError', () => {
  beforeEach(() => {
    resetMetaErrorReport();
    (sentry.captureError as jest.Mock).mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('NETWORK_ERROR seguido de outro vai uma vez só; volta a ir depois de um sucesso', () => {
    const network = () => new ApiError(0, NETWORK_ERROR);
    reportMetaError(network());
    reportMetaError(network());
    reportMetaError(network());
    expect(sentry.captureError).toHaveBeenCalledTimes(1);
    resetMetaErrorReport();
    reportMetaError(network());
    expect(sentry.captureError).toHaveBeenCalledTimes(2);
  });

  it('erro do servidor vai sempre, e reabre o reporte do próximo NETWORK_ERROR', () => {
    reportMetaError(new ApiError(0, NETWORK_ERROR));
    reportMetaError(new ApiError(502, 'INTERNAL_ERROR'));
    reportMetaError(new ApiError(502, 'INTERNAL_ERROR'));
    reportMetaError(new ApiError(0, NETWORK_ERROR));
    expect(sentry.captureError).toHaveBeenCalledTimes(4);
  });
});
