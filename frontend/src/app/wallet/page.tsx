'use client';

import { useFreighterWallet } from '@/hooks/useFreighterWallet';
import { WalletStatus } from '@/components/wallet/WalletStatus';
import { XlmBalance } from '@/components/wallet/XlmBalance';
import { SendXlmForm } from '@/components/wallet/SendXlmForm';

export default function WalletPage() {
  const { status, address, error, connect, disconnect } = useFreighterWallet();
  const connected = status === 'connected' && address !== null;

  return (
    <div className="pt-10 pb-20">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-bone">
          Stellar <span className="italic text-lock">Wallet</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md font-mono text-sm text-bone-faint">
          Freighter · XLM · Testnet
        </p>
      </div>

      <div className="mx-auto max-w-lg space-y-4">
        {/* Req 1 + 2: Wallet detection, connect/disconnect */}
        <WalletStatus
          status={status}
          address={address}
          error={error}
          onConnect={() => void connect()}
          onDisconnect={() => void disconnect()}
          connecting={status === 'connecting'}
        />

        {/* Req 3: XLM balance */}
        {connected && <XlmBalance address={address} />}

        {/* Req 4: Send XLM */}
        {connected && <SendXlmForm address={address} />}
      </div>
    </div>
  );
}
