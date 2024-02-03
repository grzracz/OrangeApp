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
    clearData,
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
import Modal from 'components/Modal';
import { Link } from 'react-router-dom';

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
let transactionsToSend = 0;
let miningMinute = 0;
let miningSecond = 0;

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

    const decimals = isMainnet ? 8 : 6;
    const totalSupply = isMainnet ? 4000000_00000000 : 4000000_000000;

    const [lastBlock, setLastBlock] = useState(0);

    const [accountData, setAccountData] = useState<AccountData>({ assetBalance: 0, effort: 0 });
    const [assetData, setAssetData] = useState<AssetData>();

    const [tpm, setTpm] = useState(60);
    const [fpt, setFpt] = useState(2000);

    const [mining, setMining] = useState(false);
    const [averageCost, setAverageCost] = useState(0);
    const [minerStats, setMinerStats] = useState<Record<string, number[]>>({});

    const { activeAccount, providers, signTransactions } = useWallet();
    const [pendingTxs, setPendingTxs] = useState(0);

    const [modalOpen, setModalOpen] = useState(false);

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
            .do();
        const costs: number[] = [];
        const miners: Record<string, [number, number]> = {};
        txs['transactions'].forEach((tx: any) => {
            try {
                const address = algosdk.encodeAddress(
                    // @ts-ignore
                    Uint8Array.from(Buffer.from(tx['logs'][0], 'base64')).slice(0, 32),
                );
                if (address !== 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ') {
                    const cost = algosdk.decodeUint64(
                        // @ts-ignore
                        Uint8Array.from(Buffer.from(tx['logs'][0], 'base64')).slice(32),
                        'safe',
                    );
                    if (miners[address]) {
                        miners[address][0] += 1;
                        miners[address][1] += cost;
                    } else miners[address] = [1, cost];
                    costs.push(cost);
                }
            } catch {}
        });
        const average = costs.reduce((a, b) => a + b, 0) / costs.length;
        setAverageCost(average / (minerReward || 1));
        setMinerStats(miners);
    };

    const updateAssetData = async () => {
        const data = await client.getApplicationByID(applicationId).do();
        const state = data['params']['global-state'];
        const minerReward = keyToValue(state, 'miner_reward');
        updateAverageCost(minerReward / Math.pow(10, decimals));
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
            toast.success(`Sending ${formatAmount(assetData?.minerReward, decimals)} ORA to your main wallet!`);
            setMined((mined) => mined + (assetData?.minerReward || 0));
            playBling();
        }
        setLastBlock(assetData?.block || 0);
    }, [assetData]);

    useEffect(() => {
        const interval = setInterval(() => {
            setDiff(Math.min(dayjs().diff(dayjs.unix(assetData?.startTimestamp || 0)), 1));
        }, 33);
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
                    let accountAddress = await getAddress();
                    if (!accountAddress) {
                        accountAddress = await addAccount(account);
                    }
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
                amount: minerBalance,
                closeRemainderTo: activeAccount?.address || address,
                suggestedParams: await client.getTransactionParams().do(),
            }),
        ]).then(() => updateMinerData(address));
    };

    const cost = Math.floor((tpm / 60) * fpt);

    const minerSigner = async (group: algosdk.Transaction[]): Promise<Uint8Array[]> => {
        const blobs = await signMinerTransactions(group);
        return blobs.map((b) => b.blob);
    };

    const mine = async (tpm: number, fpt: number, dAddress: string, mAddress: string, lAddress: string) => {
        const suggestedParams = await client.getTransactionParams().do();
        const contract = new algosdk.ABIContract(abi);
        const method = contract.getMethodByName('mine');
        suggestedParams.flatFee = true;
        suggestedParams.fee = fpt;
        let currentMinute = dayjs().unix();
        currentMinute = currentMinute - (currentMinute % 60);
        if (miningMinute !== currentMinute) {
            transactionsToSend = tpm;
            miningMinute = currentMinute;
            miningSecond = 1;
        }
        let amount = 0;
        const interval = tpm < 60 ? Math.floor(60 / tpm) : 1;
        if (miningSecond % interval === 0) {
            amount = Math.min(transactionsToSend, Math.ceil(tpm / (60 / interval)));
        }
        transactionsToSend -= amount;
        miningSecond += 1;
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

    const diffSeconds = diff - (diff % 1000);

    useEffect(() => {
        let interval = 0;
        if (mining && diffSeconds < 0) {
            toast.loading(`Juicing will start in ${Math.abs(diffSeconds / 1000)} seconds!`, { duration: 1000 });
        } else if (mining && activeAccount && assetData && assetData.lastMiner) {
            interval = setInterval(() => mine(tpm, fpt, activeAccount.address, address, assetData.lastMiner), 1000);
        }
        if (!mining) {
            setMined(0);
            transactionsToSend = 0;
            miningMinute = 0;
            miningSecond = 0;
        }
        return () => clearInterval(interval);
    }, [mining, assetData?.lastMiner, diffSeconds]);

    useEffect(() => {
        if (mining && cost > minerBalance) {
            setMining(false);
            toast.error('No more funds. Please fund your juicer 🥺', { duration: Infinity });
        }
    }, [cost, minerBalance, mining]);

    const minerList = useMemo(() => {
        const addresses = Object.keys(minerStats);
        addresses.sort((a, b) => minerStats[b][0] - minerStats[a][0]);
        return addresses.map((a) => [a, minerStats[a][0], minerStats[a][1]]);
    }, [minerStats]);

    const miningSecondsLeft = minerBalance / cost;
    const miningHours = Math.floor(miningSecondsLeft / 3600);
    const miningMinutes = Math.floor((miningSecondsLeft % 3600) / 60);

    const halvingDenominator = 2 ^ (assetData?.halving || 0);
    const totalHalvingSupply = totalSupply / halvingDenominator;

    const removeJuicerData = async () => {
        await clearData();
        setPasswordSet(false);
        setModalOpen(false);
    };

    return (
        <div className="pb-16">
            <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
                <div className="max-w-md flex flex-col space-y-4 bg-orange-500 p-4 rounded-lg shadow-lg border border-black">
                    <div className="flex flex-col items-center justify-center text-center">
                        <h3 className="font-bold pb-2">Are you sure?</h3>
                        <h4 className="text-sm text-red-800">
                            This action is irreversible. You will lose access to your current juicer and will not be
                            able to withdraw your funds stored there.
                        </h4>
                    </div>
                    <div className="flex items-center w-full justify-center space-x-2">
                        <Button onClick={() => setModalOpen(false)}>Cancel</Button>
                        <Button onClick={removeJuicerData} secondary>
                            Remove juicer data
                        </Button>
                    </div>
                </div>
            </Modal>
            <div
                className={classNames(
                    'fixed top-0 w-full z-10 text-sm px-2 py-1 font-mono text-center text-orange-800',
                    isMainnet ? 'bg-yellow-400' : 'bg-red-400',
                )}
            >
                You are currently on {isMainnet ? 'MainNet. Be careful while making transactions!' : 'TestNet.'}{' '}
                Application{' '}
                <a
                    className="underline"
                    target="_blank"
                    href={`https://${isMainnet ? '' : 'testnet.'}allo.info/application/${applicationId}`}
                >
                    {applicationId}
                </a>{' '}
                & asset{' '}
                <a
                    className="underline"
                    target="_blank"
                    href={`https://${isMainnet ? '' : 'testnet.'}allo.info/asset/${assetId}`}
                >
                    {assetId}
                </a>
                .
            </div>
            <div className="flex w-full justify-center items-center py-4 relative flex-col space-y-8">
                <div className="flex flex-col w-full justify-center items-center flex-wrap gap-4">
                    <Link to="/" className="pointer-events-auto pt-6 hover:opacity-80 transition-all">
                        <img
                            src={orange_icon}
                            className={classNames('w-24 md:w-32 lg:w-48 h-full z-20', mining && 'animate-bounce')}
                        />
                    </Link>
                    <div className="flex flex-col md:flex-row justify-center items-center gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">{formatAmount(totalSupply, decimals)}</span>
                            <span className="text-sm opacity-80">Total ORA supply</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">
                                {formatAmount(assetData?.minedSupply || 0, decimals)}{' '}
                                <span className="text-xs opacity-60">
                                    {formatAmount((100 * (assetData?.minedSupply || 0)) / totalSupply, 0)}%
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
                                {!isMainnet && (
                                    <QRCode
                                        value={address}
                                        size={140}
                                        className="border-4 hidden md:block border-white"
                                    />
                                )}
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
                                        {formatAmount(accountData?.assetBalance, decimals)} ORA
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
                                {isMainnet ? (
                                    <span className="text-xs opacity-80 w-64 py-2">
                                        Juicing from the web app is disabled for mainnet. Connect your main wallet to
                                        withdraw from your juicer.
                                    </span>
                                ) : (
                                    <span className="text-xs opacity-80 py-2">
                                        Connect your main wallet to start juicing!
                                    </span>
                                )}
                            </div>
                        )}
                        {!isMainnet && (
                            <div className="flex flex-col items-center gap-2 bg-orange-500 bg-opacity-80 p-4 rounded-lg shadow-lg">
                                {!mining && (
                                    <>
                                        <Slider
                                            name="Transactions per minute"
                                            min={6}
                                            max={7680}
                                            value={tpm}
                                            ticker={`TPM (${formatAmount(tpm / 60, 0)} TPS)`}
                                            onChange={setTpm}
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
                                    <label className="block text-xs font-medium">Cost per minute</label>
                                    <span className="font-bold heading">{formatAmount(cost * 60)} ALGO</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <label className="block text-xs font-medium">Juicing time left</label>
                                    <span className="font-bold heading">
                                        {miningHours} {miningHours === 1 ? 'hour' : 'hours'}, {miningMinutes}{' '}
                                        {miningMinutes === 1 ? 'minute' : 'minutes'}
                                    </span>
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
                                            <span className="font-bold heading">
                                                {formatAmount(mined, decimals)} ORA
                                            </span>
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
                                        !accountData.appOptedIn || !accountData.assetOptedIn || minerBalance < cost
                                    }
                                >
                                    {mining ? 'Stop' : 'Start'} juicing
                                </Button>
                            </div>
                        )}
                    </div>
                ) : passwordSet !== undefined ? (
                    <div className="flex flex-col justify-center items-center space-y-4">
                        <span className="max-w-screen-sm text-center text-white bg-red-600 rounded text-sm p-2">
                            Your juicer is a local hot wallet stored in browser storage. <br />
                            <b>Make sure to withdraw your ALGO before clearing browser data!</b>
                        </span>
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
                        {passwordSet && (
                            <button
                                onClick={() => setModalOpen(true)}
                                className="text-sm font-bold text-red-600 cursor-pointer hover:text-red-700 transition-all"
                            >
                                Remove juicer data
                            </button>
                        )}
                    </div>
                ) : (
                    <></>
                )}
                {txIndex > 0 && (
                    <div className="flex flex-col w-full justify-center items-center flex-wrap gap-2">
                        <span className="font-bold heading text-2xl">Your juicing transactions</span>
                        <span className="heading">
                            <b>{txIndex}</b> sent, <b>{pendingTxs}</b> pending
                        </span>
                        {(mining || pendingTxs > 0) && (
                            <div
                                className="flex w-full flex-wrap gap-2 max-w-screen-md justify-center items-center overflow-y-auto"
                                style={{ height: 100, maxHeight: 100 }}
                            >
                                {new Array(pendingTxs).fill(0).map((_, i) => (
                                    <img src={orange_icon} className="w-8 h-8" key={`tx-${i}`} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center justify-center flex-col md:flex-row gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.halvingSupply || 0, decimals)}{' '}
                            <span className="text-xs opacity-60">
                                {formatAmount((100 * (assetData?.halvingSupply || 0)) / totalHalvingSupply, 0)}%
                            </span>
                        </span>
                        <span className="text-sm opacity-80">Halving ORA supply</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.minerReward || 0, decimals)} ORA
                        </span>
                        <span className="text-sm opacity-80">Juicer reward</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            ~{assetData ? formatAmount((assetData.halvingSupply * 5) / assetData.minerReward, 0) : 0}
                        </span>
                        <span className="text-sm opacity-80">Rounds to halving</span>
                    </div>
                </div>
                {!isMainnet && (
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
                )}
                <div className="flex flex-col justify-center text-center items-center flex-wrap gap-4 bg-orange-100 p-4 rounded-lg shadow-lg">
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">Top recent juicers</span>
                        <span className="font-bold opacity-60 text-sm">Last 1000 rewards</span>
                    </div>
                    {minerList.length > 0 ? (
                        <div className="grid grid-cols-10">
                            <b className="col-span-1"></b>
                            <b className="col-span-3">Address</b>
                            <b className="col-span-2">ORA juiced</b>
                            <b className="col-span-2">ALGO spent</b>
                            <b className="col-span-2">ALGO per ORA</b>
                            {minerList.map(([address, amount, cost], i) => (
                                <>
                                    <span className="font-bold text-lg col-span-1 flex justify-center items-center">
                                        {i + 1}.
                                    </span>
                                    <div className="col-span-3 p-2">
                                        <AccountName account={address as string} />
                                    </div>
                                    <div className="flex items-center justify-center col-span-2">
                                        {formatAmount((amount as number) * (assetData?.minerReward || 0), decimals)}
                                    </div>
                                    <div className="flex items-center justify-center col-span-2">
                                        {formatAmount(cost as number)}
                                    </div>
                                    <div className="flex items-center justify-center col-span-2">
                                        {formatAmount(
                                            ((isMainnet ? 100 : 1) * (cost as number)) /
                                                ((amount as number) * (assetData?.minerReward || 0)),
                                            0,
                                        )}
                                    </div>
                                </>
                            ))}
                        </div>
                    ) : (
                        <div className="opacity-50">Juicers are preparing! Come back soon.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Mining;
