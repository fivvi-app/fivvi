import { FakePaymentProvider } from './testing/fake-provider.ts';
import { providerContract } from './testing/provider-contract.ts';

providerContract(
  'FakePaymentProvider',
  () => {
    const provider = new FakePaymentProvider();
    const access = { workspaceId: 'workspace-contract', testmode: true };
    return { provider, access, pay: async (id) => provider.pay(access, id) };
  },
  { canPay: true },
);
