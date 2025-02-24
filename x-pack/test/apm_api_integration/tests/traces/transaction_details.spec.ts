/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { apm, EntityArrayIterable, timerange } from '@kbn/apm-synthtrace';
import expect from '@kbn/expect';
import { FtrProviderContext } from '../../common/ftr_provider_context';

export default function ApiTest({ getService }: FtrProviderContext) {
  const registry = getService('registry');
  const apmApiClient = getService('apmApiClient');
  const synthtraceEsClient = getService('synthtraceEsClient');

  const start = new Date('2022-01-01T00:00:00.000Z').getTime();
  const end = new Date('2022-01-01T00:15:00.000Z').getTime() - 1;

  async function fetchTransactionDetails({
    traceId,
    transactionId,
  }: {
    traceId: string;
    transactionId: string;
  }) {
    return await apmApiClient.readUser({
      endpoint: `GET /internal/apm/traces/{traceId}/transactions/{transactionId}`,
      params: {
        path: { traceId, transactionId },
      },
    });
  }

  registry.when('Transaction details dont exist', { config: 'basic', archives: [] }, () => {
    it('handles empty state', async () => {
      const response = await fetchTransactionDetails({
        traceId: 'foo',
        transactionId: 'bar',
      });

      expect(response.status).to.be(200);
      expect(response.body).to.eql({});
    });
  });

  registry.when('Transaction details', { config: 'basic', archives: [] }, () => {
    let traceId: string;
    let transactionId: string;
    before(async () => {
      const instanceJava = apm
        .service({ name: 'synth-apple', environment: 'production', agentName: 'java' })
        .instance('instance-b');
      const events = timerange(start, end)
        .interval('1m')
        .rate(1)
        .generator((timestamp) => {
          return [
            instanceJava
              .transaction({ transactionName: 'GET /apple 🍏' })
              .timestamp(timestamp)
              .duration(1000)
              .failure()
              .errors(
                instanceJava
                  .error({ message: '[ResponseError] index_not_found_exception' })
                  .timestamp(timestamp + 50)
              )
              .children(
                instanceJava
                  .span({
                    spanName: 'get_green_apple_🍏',
                    spanType: 'db',
                    spanSubtype: 'elasticsearch',
                  })
                  .timestamp(timestamp + 50)
                  .duration(900)
                  .success()
              ),
          ];
        });
      const entities = events.toArray();
      const transaction = entities[0];
      transactionId = transaction?.['transaction.id']!;
      traceId = transaction?.['trace.id']!;

      await synthtraceEsClient.index(new EntityArrayIterable(entities));
    });

    after(() => synthtraceEsClient.clean());

    describe('transaction details', () => {
      let transactionDetails: Awaited<ReturnType<typeof fetchTransactionDetails>>['body'];
      before(async () => {
        const response = await fetchTransactionDetails({
          traceId,
          transactionId,
        });
        expect(response.status).to.eql(200);
        transactionDetails = response.body;
      });
      it('returns transaction details', () => {
        expect(transactionDetails.transaction.name).to.eql('GET /apple 🍏');
      });
    });
  });
}
