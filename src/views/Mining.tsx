import { useEffect, useMemo, useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import {
    addAccount,
    getAddress,
    isPasswordSet,
    setPassword,
    signTransactions as signMinerTransactions,
    verifyPassword,
} from '@tamequest/account';
import algosdk from 'algosdk';
import toast from 'react-hot-toast';
import AccountName from '../components/AccountName';
import QRCode from 'react-qr-code';
import { useWallet } from '@txnlab/use-wallet';
import Slider from 'components/Slider';
import abi from '../abi/OrangeCoin.arc4.json';
import { classNames, formatAmount } from 'utils';
import orange_icon from '../assets/orange.svg';
import useSound from 'use-sound';
import bling from '../assets/bling.wav';
import Timer from 'components/Timer';
import dayjs from 'dayjs';

type AccountData = {
    assetBalance: number;
    assetOptedIn?: boolean;
    effort: number;
    appOptedIn?: boolean;
};

type AssetData = {
    block: number;
    startTimestamp: number;
    totalEffort: number;
    totalTransactions: number;
    halving: number;
    halvingSupply: number;
    minedSupply: number;
    minerReward: number;
    lastMiner: string;
};

let txIndex = 0;

type MiningProps = {
    nodeUrl: string;
    nodePort: number;
    indexerUrl: string;
    indexerPort: number;
    applicationId: number;
    assetId: number;
    isMainnet?: boolean;
};

function Mining({ nodeUrl, nodePort, indexerPort, indexerUrl, applicationId, assetId, isMainnet }: MiningProps) {
    const client = new algosdk.Algodv2('', nodeUrl, nodePort);
    const [playBling] = useSound(bling);
    const account = useMemo(() => algosdk.generateAccount(), []);
    const [address, setAddress] = useState('');
    const [passwordSet, setPasswordSet] = useState<boolean>();
    const [inputPassword, setInputPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [minerBalance, setMinerBalance] = useState(0);
    const [mined, setMined] = useState(0);
    const [diff, setDiff] = useState(0);

    const [lastBlock, setLastBlock] = useState(0);

    const [accountData, setAccountData] = useState<AccountData>({ assetBalance: 0, effort: 0 });
    const [assetData, setAssetData] = useState<AssetData>();

    const [tps, setTps] = useState(1);
    const [fpt, setFpt] = useState(2000);

    const [mining, setMining] = useState(false);
    const [averageCost, setAverageCost] = useState(0);

    const { activeAccount, providers, signTransactions } = useWallet();
    const [pendingTxs, setPendingTxs] = useState(0);

    const checkPasswordSet = async () => {
        setPasswordSet(await isPasswordSet());
    };

    const updateMinerData = async (address: string) => {
        try {
            const data = await client.accountInformation(address).do();
            setMinerBalance(Math.max(0, data['amount'] - data['min-balance']));
        } catch {
            setMinerBalance(0);
        }
    };

    const updateAccountData = async (address: string) => {
        const data = await client.accountInformation(address).do();
        const asset = data.assets.find((a: any) => a['asset-id'] === assetId);
        const app = data['apps-local-state'].find((a: any) => a['id'] === applicationId);
        const kv = app ? app['key-value'].find((kv: any) => kv.key === 'ZWZmb3J0') : undefined;
        setAccountData({
            assetOptedIn: !!asset,
            assetBalance: asset ? asset['amount'] : 0,
            appOptedIn: !!app,
            effort: kv?.value.uint || 0,
        });
    };

    const keyToValue = (state: any, key: string): number => {
        const bKey = btoa(key);
        const kv = state.find((k: any) => k['key'] === bKey);
        if (kv) {
            return kv.value.uint;
        }
        return 0;
    };

    const keyToAddress = (state: any, key: string): string => {
        const bKey = btoa(key);
        const kv = state.find((k: any) => k['key'] === bKey);
        if (kv) {
            // @ts-ignore
            return algosdk.encodeAddress(Buffer.from(kv.value.bytes, 'base64'));
        }
        return '';
    };

    const updateAverageCost = async (minerReward: number) => {
        const indexer = new algosdk.Indexer('', indexerUrl, indexerPort);
        const txs = await indexer
            .searchForTransactions()
            .address(algosdk.getApplicationAddress(applicationId))
            .addressRole('sender')
            .limit(100)
            .do();
        const costs: number[] = [];
        txs['transactions'].forEach((tx: any) => {
            try {
                // @ts-ignore
                const cost = Uint8Array.from(Buffer.from(tx['logs'][0], 'base64')).slice(32);
                costs.push(algosdk.decodeUint64(cost, 'safe'));
            } catch {}
        });
        const average = costs.reduce((a, b) => a + b, 0) / costs.length;
        setAverageCost(average / (minerReward || 1));
    };

    const updateAssetData = async () => {
        const data = await client.getApplicationByID(applicationId).do();
        const state = data['params']['global-state'];
        const minerReward = keyToValue(state, 'miner_reward');
        updateAverageCost(minerReward / Math.pow(10, 6));
        setAssetData({
            block: keyToValue(state, 'block'),
            startTimestamp: keyToValue(state, 'start_timestamp'),
            totalEffort: keyToValue(state, 'total_effort'),
            totalTransactions: keyToValue(state, 'total_transactions'),
            halving: keyToValue(state, 'halving'),
            halvingSupply: keyToValue(state, 'halving_supply'),
            minedSupply: keyToValue(state, 'mined_supply'),
            minerReward,
            lastMiner: keyToAddress(state, 'last_miner'),
        });
    };

    useEffect(() => {
        if (
            lastBlock &&
            assetData &&
            activeAccount &&
            assetData.lastMiner &&
            lastBlock !== assetData.block &&
            assetData.lastMiner === activeAccount.address
        ) {
            toast.success(`Sending ${formatAmount(assetData?.minerReward)} ORA to your main wallet!`);
            setMined((mined) => mined + (assetData?.minerReward || 0));
            playBling();
        }
        setLastBlock(assetData?.block || 0);
    }, [assetData]);

    useEffect(() => {
        const interval = setInterval(() => setDiff(dayjs().diff(dayjs.unix(assetData?.startTimestamp || 0))), 33);
        return () => clearInterval(interval);
    }, [assetData?.startTimestamp]);

    useEffect(() => {
        checkPasswordSet();
        updateAssetData();
        const interval = setInterval(updateAssetData, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let interval = 0;
        if (address) {
            updateMinerData(address);
            interval = setInterval(() => updateMinerData(address), 5000);
        }
        return () => clearInterval(interval);
    }, [address]);

    useEffect(() => {
        if (activeAccount?.address) {
            updateAccountData(activeAccount.address);
            const interval = setInterval(() => updateAccountData(activeAccount.address), 5000);
            return () => clearInterval(interval);
        }
    }, [activeAccount]);

    const signIn = async () => {
        try {
            if (!(await isPasswordSet())) {
                await setPassword(inputPassword);
                if (await verifyPassword(inputPassword)) {
                    const accountAddress = await addAccount(account);
                    if (accountAddress) {
                        setAddress(accountAddress);
                    }
                }
            } else if (await verifyPassword(inputPassword)) {
                const accountAddress = await getAddress();
                if (accountAddress) {
                    setAddress(accountAddress);
                }
            } else {
                throw new Error('Password invalid.');
            }
        } catch (e: any) {
            toast.error(e?.toString());
        }
    };

    const signAndSendMinerTransactions = async (txns: algosdk.Transaction[], quiet?: boolean) => {
        const promise = new Promise((resolve, reject) => {
            signMinerTransactions(txns)
                .catch(reject)
                .then((blobs) => {
                    if (blobs)
                        client
                            .sendRawTransaction(blobs.map((b) => b.blob))
                            .do()
                            .catch(reject)
                            .then(({ txId }) => {
                                algosdk.waitForConfirmation(client, txId, 5).catch(reject).then(resolve);
                            });
                    else reject('Failed to sign transactions.');
                });
        });
        return quiet
            ? promise
            : toast.promise(promise, {
                  loading: 'Executing juicer transactions...',
                  success: 'Transactions sent!',
                  error: (e) => e?.toString(),
              });
    };

    const signAndSendMainTransactions = async (txns: Uint8Array[]) => {
        return toast.promise(
            new Promise((resolve, reject) => {
                signTransactions(txns)
                    .catch(reject)
                    .then((blobs) => {
                        if (blobs)
                            client
                                .sendRawTransaction(blobs)
                                .do()
                                .catch(reject)
                                .then(({ txId }) => {
                                    algosdk.waitForConfirmation(client, txId, 5).catch(reject).then(resolve);
                                });
                        else reject('Failed to sign transactions.');
                    });
            }),
            {
                loading: 'Executing main wallet transactions...',
                success: 'Transactions sent!',
                error: (e) => e?.toString(),
            },
        );
    };

    const optIn = async () => {
        try {
            const suggestedParams = await client.getTransactionParams().do();
            const txns = [];
            if (!accountData.appOptedIn) {
                txns.push(
                    algosdk.makeApplicationOptInTxnFromObject({
                        from: activeAccount?.address || '',
                        appIndex: applicationId,
                        suggestedParams,
                    }),
                );
            }
            if (!accountData.assetOptedIn) {
                txns.push(
                    algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                        from: activeAccount?.address || '',
                        to: activeAccount?.address || '',
                        assetIndex: assetId,
                        amount: 0,
                        suggestedParams,
                    }),
                );
            }
            if (txns.length > 1) algosdk.assignGroupID(txns);
            signAndSendMainTransactions(txns.map(algosdk.encodeUnsignedTransaction)).then(() =>
                updateAccountData(activeAccount?.address || ''),
            );
        } catch (e: any) {
            toast.error(e?.toString());
        }
    };

    const withdraw = async () => {
        signAndSendMinerTransactions([
            algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                from: address,
                to: activeAccount?.address || address,
                amount: minerBalance - 1000,
                suggestedParams: await client.getTransactionParams().do(),
            }),
        ]).then(() => updateMinerData(address));
    };

    const cost = tps * fpt;

    const minerSigner = async (group: algosdk.Transaction[]): Promise<Uint8Array[]> => {
        const blobs = await signMinerTransactions(group);
        return blobs.map((b) => b.blob);
    };

    const mine = async (tps: number, fpt: number, dAddress: string, mAddress: string, lAddress: string) => {
        const suggestedParams = await client.getTransactionParams().do();
        const contract = new algosdk.ABIContract(abi);
        const method = contract.getMethodByName('mine');
        suggestedParams.flatFee = true;
        suggestedParams.fee = fpt;
        let amount = tps;
        while (amount > 0) {
            const groupSize = amount > 16 ? 16 : amount;
            amount -= groupSize;
            const atc = new algosdk.AtomicTransactionComposer();
            for (let i = 0; i < groupSize; i += 1) {
                setPendingTxs((txs) => txs + 1);
                txIndex += 1;
                atc.addMethodCall({
                    appID: applicationId,
                    method,
                    methodArgs: [algosdk.decodeAddress(dAddress).publicKey],
                    appAccounts: [lAddress, dAddress],
                    appForeignAssets: [assetId],
                    sender: mAddress,
                    signer: minerSigner,
                    note: Uint8Array.from([txIndex]),
                    suggestedParams,
                });
            }
            // @ts-ignore
            const atcTransactions = atc.transactions.map((tx) => tx.txn);
            if (atcTransactions.length > 1) algosdk.assignGroupID(atcTransactions);
            signAndSendMinerTransactions(atcTransactions, true)
                .then(() => updateMinerData(address))
                .finally(() => setPendingTxs((txs) => txs - groupSize));
        }
    };

    useEffect(() => {
        let interval = 0;
        if (mining && activeAccount && assetData && assetData.lastMiner) {
            interval = setInterval(() => mine(tps, fpt, activeAccount.address, address, assetData.lastMiner), 1000);
        }
        if (!mining) {
            setMined(0);
        }
        return () => clearInterval(interval);
    }, [mining, assetData?.lastMiner]);

    useEffect(() => {
        if (mining && cost > minerBalance) {
            setMining(false);
            toast.error('No more funds. Please fund your juicer 🥺', { duration: Infinity });
        }
    }, [cost, minerBalance, mining]);

    return (
        <>
            <div
                className={classNames(
                    'fixed top-0 w-full  text-sm px-2 py-1 font-mono text-center text-orange-800',
                    isMainnet ? 'bg-yellow-400' : 'bg-red-400',
                )}
            >
                You are currently on {isMainnet ? 'MainNet. Be careful while making transactions!' : 'TestNet.'}
            </div>
            <div className="flex w-full justify-center items-center py-4 relative flex-col space-y-8">
                <div className="flex flex-col w-full justify-center items-center flex-wrap gap-4">
                    <img
                        src={orange_icon}
                        className={classNames('w-24 md:w-32 lg:w-48 h-full z-20', mining && 'animate-bounce')}
                    />
                    <div className="flex flex-col md:flex-row justify-center items-center gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">{formatAmount(4000000000000)}</span>
                            <span className="text-sm opacity-80">Total ORA supply</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">
                                {formatAmount(assetData?.minedSupply || 0)}{' '}
                                <span className="text-xs opacity-60">
                                    {formatAmount((assetData?.minedSupply || 0) / 40000000000, 0)}%
                                </span>
                            </span>
                            <span className="text-sm opacity-80">Juiced ORA supply</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">{formatAmount(averageCost)} ALGO</span>
                            <span className="text-sm opacity-80">Recent effort per ORA</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">
                                {formatAmount(assetData?.totalEffort || 0)}
                            </span>
                            <span className="text-sm opacity-80">Total ALGO effort</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">
                                {formatAmount(assetData?.totalTransactions || 0, 0)}
                            </span>
                            <span className="text-sm opacity-80">Juicing transactions</span>
                        </div>
                    </div>
                </div>
                {diff < 0 && <Timer diff={diff} />}
                {address ? (
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-center md:items-start">
                        <div className="space-y-2">
                            <div className="flex flex-col  items-center gap-2 bg-orange-500 bg-opacity-80 p-6 rounded-lg shadow-lg">
                                <div className="font-bold">Your juicer:</div>
                                <QRCode value={address} size={140} className="border-4 hidden md:block border-white" />
                                <AccountName account={address} />
                                <div className="flex flex-col items-center">
                                    <label className="block text-xs font-medium">Juicer balance</label>
                                    <span className="font-bold heading">{formatAmount(minerBalance)} ALGO</span>
                                </div>
                                {!mining && (
                                    <Button onClick={withdraw} disabled={minerBalance === 0 || !activeAccount}>
                                        Withdraw
                                    </Button>
                                )}
                            </div>
                        </div>
                        {activeAccount ? (
                            <div className="flex flex-col items-center gap-2 bg-orange-500 bg-opacity-80 p-8 rounded-lg shadow-lg">
                                {!mining && (
                                    <div className="pb-4">
                                        <Button onClick={() => providers?.forEach((p) => p.disconnect())}>
                                            Disconnect
                                        </Button>
                                    </div>
                                )}
                                <div className="font-bold">Deposits to:</div>
                                <AccountName account={activeAccount.address} />
                                {(!accountData.appOptedIn || !accountData.assetOptedIn) && (
                                    <Button onClick={optIn}>Opt in</Button>
                                )}
                                <div className="flex flex-col items-center">
                                    <label className="block text-xs font-medium">Your balance</label>
                                    <span className="font-bold heading">
                                        {formatAmount(accountData?.assetBalance)} ORA
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-sm flex flex-col text-center gap-2 items-center">
                                {providers?.map((p) => (
                                    <Button onClick={p.connect} key={`connect-${p.metadata.id}`}>
                                        <div className="flex space-x-2 items-center">
                                            <img className="w-8 h-8 rounded" src={p.metadata.icon} />
                                            <span>Connect {p.metadata.name}</span>{' '}
                                        </div>
                                    </Button>
                                ))}
                                <span className="text-xs opacity-80 py-2">
                                    Connect your main wallet to start juicing!
                                </span>
                            </div>
                        )}
                        <div className="flex flex-col items-center gap-2 bg-orange-500 bg-opacity-80 p-4 rounded-lg shadow-lg">
                            {!mining && (
                                <>
                                    <Slider
                                        name="Transactions per second"
                                        min={1}
                                        max={128}
                                        value={tps}
                                        ticker="TPS"
                                        onChange={setTps}
                                        step={1}
                                    />
                                    <Slider
                                        name="Fee per transaction"
                                        min={2000}
                                        max={20000}
                                        step={500}
                                        value={fpt}
                                        ticker="ALGO"
                                        decimals={6}
                                        onChange={setFpt}
                                    />
                                </>
                            )}
                            <div className="flex flex-col items-center">
                                <label className="block text-xs font-medium">Cost per second</label>
                                <span className="font-bold heading">{formatAmount(cost)} ALGO</span>
                            </div>
                            {mining && (
                                <>
                                    <div className="flex flex-col items-center">
                                        <label className="block text-xs font-medium">Current effort</label>
                                        <span className="font-bold heading">
                                            {formatAmount(accountData?.effort)} ALGO
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <label className="block text-xs font-medium">Session rewards</label>
                                        <span className="font-bold heading">{formatAmount(mined)} ORA</span>
                                    </div>
                                </>
                            )}
                            {mining && (
                                <span className="text-orange-900 text-xs text-bold animate-pulse">
                                    Juicing in progress...
                                </span>
                            )}
                            <Button
                                onClick={() => setMining(!mining)}
                                disabled={
                                    !accountData.appOptedIn ||
                                    !accountData.assetOptedIn ||
                                    minerBalance < cost ||
                                    diff < 0
                                }
                            >
                                {mining ? 'Stop' : 'Start'} juicing
                            </Button>
                        </div>
                    </div>
                ) : passwordSet !== undefined ? (
                    <div className="max-w-sm flex flex-col md:max-w-md mx-4 lg:max-w-lg xl:max-w-xl space-y-4 bg-orange-500 bg-opacity-80 p-4 rounded-lg shadow-lg border border-black">
                        <Input
                            value={inputPassword}
                            onChange={setInputPassword}
                            placeholder="Password"
                            type="password"
                        />
                        {!passwordSet && (
                            <Input
                                value={confirmPassword}
                                onChange={setConfirmPassword}
                                placeholder="Confirm password"
                                type="password"
                            />
                        )}
                        <Button onClick={signIn}>{passwordSet ? 'Unlock juicer' : 'Set juicer password'}</Button>
                    </div>
                ) : (
                    <></>
                )}
                {pendingTxs > 0 && (
                    <div className="flex flex-col w-full justify-center items-center flex-wrap gap-4">
                        <span className="font-bold heading text-2xl">Pending transactions</span>
                        <div className="flex w-full flex-wrap gap-2 max-w-screen-md justify-center items-center">
                            {new Array(pendingTxs).fill(0).map((_, i) => (
                                <img src={orange_icon} className="w-8 h-8" key={`tx-${i}`} />
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex items-center justify-center flex-col md:flex-row gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.halvingSupply || 0)}{' '}
                            <span className="text-xs opacity-60">
                                {formatAmount(
                                    (assetData?.halvingSupply || 0) / (40000000000 / (2 ^ (assetData?.halving || 0))),
                                    0,
                                )}
                                %
                            </span>
                        </span>
                        <span className="text-sm opacity-80">Halving ORA supply</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.minerReward || 0)} ORA
                        </span>
                        <span className="text-sm opacity-80">Juicer reward</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            ~{assetData ? formatAmount((assetData.halvingSupply * 10) / assetData.minerReward, 0) : 0}
                        </span>
                        <span className="text-sm opacity-80">Rounds to halving</span>
                    </div>
                </div>
                <div className="flex flex-col w-full justify-center items-center flex-wrap gap-4 p-2">
                    <span className="font-bold heading text-2xl">How to juice?</span>
                    <div className="flex items-start gap-4 bg-orange-500 bg-opacity-80 p-4 rounded-lg shadow-lg">
                        <ul>
                            <li>
                                <b>One.</b> Connect & opt in with your main wallet.
                            </li>
                            <li>
                                <b>Two.</b> Deposit funds to your juicer.
                            </li>
                            <li>
                                <b>Three.</b> Update juicing settings.
                            </li>
                            <li>
                                <b>Four.</b> Start juicing!
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}

export default Mining;