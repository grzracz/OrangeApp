import { useEffect, useMemo, useState } from 'react';

import algosdk from 'algosdk';
import toast from 'react-hot-toast';

import { useWallet } from '@txnlab/use-wallet';
import abi from '../abi/OrangeCoin.arc4.json';
import minerAbi from '../abi/OrangeMiner.arc4.json';
import tinyman from '../assets/tinyman.png';
import { classNames, formatAmount } from 'utils';
import orange_icon from '../assets/orange.svg';
import Timer from 'components/Timer';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import AccountName from 'components/AccountName';
import Button from 'components/Button';
import Input from 'components/Input';
import { STAKING_APP_INDEX } from 'consts';

type AppData = {
    manager: string;
    miningApplication: number;
    miningToken: number;
    poolAddress: string;
    poolApplication: number;
    poolToken: number;
    minDeposit: number;
    baseTxnFee: number;
    marketRateBps: number;
    totalDeposited: number;
    totalSpent: number;
    rewardBalance: number;
    totalWithdrawn: number;
    lastSpent: number;
    lastRewards: number;
    spentPerToken: bigint;
    rewardPerToken: bigint;
    lastPriceRound: number;
};

type PoolData = {
    reservesA: number;
    reservesB: number;
    tokens: number;
};

type AccountData = {
    balance: number;
    assetBalance: number;
    assetOptedIn?: boolean;
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
    lastEffort: number;
};

type BoxData = {
    deposited: number;
    depositedAt: number;
    spentPerToken: bigint;
    rewardPerToken: bigint;
    totalSpent: number;
    totalWithdrawn: number;
    claimable: number;
};

type StakingProps = {
    nodeUrl: string;
    nodePort: number;
    applicationId: number;
    assetId: number;
    isMainnet?: boolean;
};

const decodeBox = (boxData: Uint8Array): BoxData => {
    return {
        deposited: algosdk.decodeUint64(boxData.slice(0, 8), 'safe'),
        depositedAt: algosdk.decodeUint64(boxData.slice(8, 16), 'safe'),
        spentPerToken: algosdk.bytesToBigInt(boxData.slice(16, 32)),
        rewardPerToken: algosdk.bytesToBigInt(boxData.slice(32, 48)),
        totalSpent: algosdk.decodeUint64(boxData.slice(48, 56), 'safe'),
        totalWithdrawn: algosdk.decodeUint64(boxData.slice(56, 64), 'safe'),
        claimable: algosdk.decodeUint64(boxData.slice(64, 72), 'safe'),
    };
};

const time = 1707138000;

function Staking({ nodeUrl, nodePort, applicationId, assetId, isMainnet }: StakingProps) {
    const client = new algosdk.Algodv2('', nodeUrl, nodePort);
    const [diff, setDiff] = useState(Math.min(dayjs().diff(dayjs.unix(time)), 1));

    const decimals = isMainnet ? 8 : 6;
    const totalSupply = isMainnet ? 4000000_00000000 : 4000000_000000;

    const [appData, setAppData] = useState<AppData>();
    const [poolData, setPoolData] = useState<PoolData>();
    const [accountData, setAccountData] = useState<AccountData>({ balance: 0, assetBalance: 0 });
    const [accountBox, setAccountBox] = useState<BoxData>();
    const [assetData, setAssetData] = useState<AssetData>();
    const [depositAmount, setDepositAmount] = useState('');

    const actualDeposit = Math.floor(Number.parseFloat(depositAmount) * 10 ** 6);

    const { activeAccount, providers, signTransactions } = useWallet();

    const updateAppData = async () => {
        const appAccount = await client.accountInformation(algosdk.getApplicationAddress(STAKING_APP_INDEX)).do();
        const data = await client.getApplicationByID(STAKING_APP_INDEX).do();
        const state = data['params']['global-state'];
        const poolAddress = keyToAddress(state, 'poolAddress');
        const poolApplication = keyToValue(state, 'poolApplication');
        const poolToken = keyToValue(state, 'poolToken');
        const asset = appAccount.assets.find((a: any) => a['asset-id'] === poolToken);
        updatePoolData(poolAddress, poolApplication);
        setAppData({
            manager: keyToAddress(state, 'manager'),
            miningApplication: keyToValue(state, 'miningApplication'),
            miningToken: keyToValue(state, 'miningToken'),
            poolAddress: poolAddress,
            poolApplication: poolApplication,
            poolToken: poolToken,
            minDeposit: keyToValue(state, 'minDeposit'),
            baseTxnFee: keyToValue(state, 'baseTxnFee'),
            marketRateBps: keyToValue(state, 'marketRateBps'),
            totalDeposited: keyToValue(state, 'totalDeposited'),
            totalSpent: keyToValue(state, 'totalSpent'),
            totalWithdrawn: keyToValue(state, 'totalWithdrawn'),
            lastSpent: keyToValue(state, 'lastSpent'),
            lastRewards: keyToValue(state, 'lastRewards'),
            spentPerToken: keyToBigint(state, 'spentPerToken'),
            rewardPerToken: keyToBigint(state, 'rewardPerToken'),
            lastPriceRound: keyToValue(state, 'lastPriceRound'),
            rewardBalance: asset['amount'],
        });
    };

    const updatePoolData = async (address: string, application: number) => {
        const appAccount = await client.accountInformation(address).do();
        const app = appAccount['apps-local-state'].find((a: any) => a['id'] === application);
        const state = app['key-value'];
        setPoolData({
            reservesA: keyToValue(state, 'asset_2_reserves'),
            reservesB: keyToValue(state, 'asset_1_reserves'),
            tokens: keyToValue(state, 'issued_pool_tokens'),
        });
    };

    const updateAccountData = async (address: string) => {
        await updateAppData();
        const data = await client.accountInformation(address).do();
        const asset = data.assets.find((a: any) => a['asset-id'] === appData?.poolToken);
        setAccountData({
            balance: data['amount'] - data['min-balance'] - 100000,
            assetOptedIn: !!asset,
            assetBalance: asset ? asset['amount'] : 0,
        });
        if (activeAccount?.address) {
            try {
                const box = await client
                    .getApplicationBoxByName(STAKING_APP_INDEX, algosdk.decodeAddress(activeAccount?.address).publicKey)
                    .do();
                if (box) {
                    setAccountBox(decodeBox(box.value));
                }
            } catch {}
        }
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

    const keyToBigint = (state: any, key: string): bigint => {
        const bKey = btoa(key);
        const kv = state.find((k: any) => k['key'] === bKey);
        if (kv) {
            // @ts-ignore
            return algosdk.bytesToBigInt(Buffer.from(kv.value.bytes, 'base64'));
        }
        return BigInt(0);
    };

    const updateAssetData = async () => {
        const data = await client.getApplicationByID(applicationId).do();
        const state = data['params']['global-state'];
        const minerReward = keyToValue(state, 'miner_reward');
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
            lastEffort: keyToValue(state, 'last_miner_effort'),
        });
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setDiff(Math.min(dayjs().diff(dayjs.unix(time)), 1));
        }, 33);
        return () => clearInterval(interval);
    }, [assetData?.startTimestamp]);

    useEffect(() => {
        updateAssetData();
        updateAppData();
        const interval = setInterval(updateAssetData, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeAccount?.address) {
            updateAccountData(activeAccount.address);
            const interval = setInterval(() => updateAccountData(activeAccount.address), 5000);
            return () => clearInterval(interval);
        } else {
            setAccountBox(undefined);
            setAccountData({ assetBalance: 0, assetOptedIn: false, balance: 0 });
        }
    }, [activeAccount]);

    const signAndSendTransactions = async (txns: Uint8Array[]) => {
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
                loading: 'Sending wallet transactions...',
                success: 'Transactions sent!',
                error: (e) => e?.toString(),
            },
        );
    };

    const halvingDenominator = 2 ** (1 + (assetData?.halving || 0));
    const totalHalvingSupply = totalSupply / halvingDenominator;

    const tokensToRewards = (amount: number): [number, number] => {
        if (poolData) {
            const ratio = amount / poolData.tokens;
            return [Math.floor(ratio * poolData.reservesA), Math.floor(ratio * poolData.reservesB)];
        }
        return [0, 0];
    };

    const scale = Number('18446744073709551615');

    const [accountDeposit, accountRewards] = useMemo(() => {
        if (appData && accountBox) {
            const recentlySpent = appData.totalSpent - appData.lastSpent;
            const recentlySpentPerToken =
                appData.totalDeposited > 0 ? (recentlySpent * scale) / appData.totalDeposited : 0;
            const spentPerToken = Number(appData.spentPerToken) + recentlySpentPerToken;
            const spentDelta = spentPerToken - Number(accountBox.spentPerToken);
            const recentlyRewarded = appData.totalWithdrawn + appData.rewardBalance - appData.lastRewards;
            const recentlyRewardedPerToken =
                appData.totalDeposited > 0 ? (recentlyRewarded * scale) / appData.totalDeposited : 0;
            const rewardPerToken = Number(appData.rewardPerToken) + recentlyRewardedPerToken;
            const rewardDelta = rewardPerToken - Number(accountBox.rewardPerToken);
            const spentToDate = Math.ceil((accountBox.deposited * spentDelta) / scale);
            const rewardedToDate = Math.ceil((accountBox.deposited * rewardDelta) / scale);
            return [accountBox.deposited - spentToDate, accountBox.claimable + rewardedToDate];
        }
        return [0, 0];
    }, [appData, accountBox, activeAccount]);

    const totalRewards = !appData ? [0, 0] : tokensToRewards(appData.totalWithdrawn + appData.rewardBalance);
    const accountTotalRewards = tokensToRewards(accountRewards);
    const walletRewards = tokensToRewards(accountData.assetBalance);

    const minerContract = new algosdk.ABIContract(minerAbi);
    const signer = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
        return [];
    };

    const deposit = async () => {
        if (activeAccount?.address) {
            try {
                const atc = new algosdk.AtomicTransactionComposer();
                const suggestedParams = await client.getTransactionParams().do();
                atc.addTransaction({
                    txn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                        from: activeAccount.address,
                        to: algosdk.getApplicationAddress(STAKING_APP_INDEX),
                        amount: actualDeposit,
                        suggestedParams,
                    }),
                    signer,
                });
                atc.addMethodCall({
                    appID: STAKING_APP_INDEX,
                    method: minerContract.getMethodByName('deposit'),
                    sender: activeAccount.address,
                    boxes: [
                        {
                            appIndex: STAKING_APP_INDEX,
                            name: algosdk.decodeAddress(activeAccount.address).publicKey,
                        },
                        {
                            appIndex: STAKING_APP_INDEX,
                            name: Uint8Array.from([112]),
                        },
                    ],
                    appForeignAssets: [1284444444, 1294765516],
                    signer,
                    suggestedParams,
                });
                atc.buildGroup();
                // @ts-ignore
                const transactions = atc.transactions.map((tx) => algosdk.encodeUnsignedTransaction(tx.txn));
                signAndSendTransactions(transactions).then(() => updateAccountData(activeAccount?.address || ''));
            } catch (e: any) {
                toast.error(e?.toString());
            }
        }
    };

    const withdraw = (rewardsOnly?: boolean) => async () => {
        if (appData && activeAccount?.address) {
            try {
                const atc = new algosdk.AtomicTransactionComposer();
                const suggestedParams = await client.getTransactionParams().do();
                if (!accountData.assetOptedIn) {
                    atc.addTransaction({
                        txn: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                            assetIndex: appData.poolToken,
                            from: activeAccount.address,
                            to: activeAccount.address,
                            amount: 0,
                            suggestedParams,
                        }),
                        signer,
                    });
                }
                suggestedParams.flatFee = true;
                suggestedParams.fee = 3000;
                atc.addMethodCall({
                    appID: STAKING_APP_INDEX,
                    method: minerContract.getMethodByName('withdraw'),
                    sender: activeAccount.address,
                    methodArgs: [10000, rewardsOnly ? 0 : 10000],
                    appForeignAssets: [1294765516],
                    boxes: [
                        {
                            appIndex: STAKING_APP_INDEX,
                            name: algosdk.decodeAddress(activeAccount?.address).publicKey,
                        },
                    ],
                    signer,
                    suggestedParams,
                });
                if (!accountData.assetOptedIn) atc.buildGroup();
                // @ts-ignore
                const transactions = atc.transactions.map((tx) => algosdk.encodeUnsignedTransaction(tx.txn));
                signAndSendTransactions(transactions).then(() => updateAccountData(activeAccount?.address || ''));
            } catch (e: any) {
                toast.error(e?.toString());
            }
        }
    };

    return (
        <div className="pb-16 pt-12">
            <div
                className={classNames(
                    'fixed top-0 w-full z-10 text-sm px-2 py-1 font-mono text-center text-orange-800',
                    isMainnet ? 'bg-yellow-400' : 'bg-red-400',
                )}
            >
                You are currently on {isMainnet ? 'MainNet. Be careful while making transactions!' : 'TestNet.'} Asset{' '}
                <a
                    className="underline"
                    target="_blank"
                    href={`https://${isMainnet ? '' : 'testnet.'}allo.info/asset/${assetId}`}
                >
                    {assetId}
                </a>
                .
            </div>
            <div className="flex flex-col p-4 z-20 w-full relative justify-center items-center flex-wrap gap-4">
                <div className="flex flex-wrap justify-center items-center gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
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
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.lastEffort || 0)} ALGO
                        </span>
                        <span className="text-sm opacity-80">Recent effort per ORA</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">{formatAmount(assetData?.totalEffort || 0)}</span>
                        <span className="text-sm opacity-80">Total ALGO effort</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.totalTransactions || 0, 0)}
                        </span>
                        <span className="text-sm opacity-80">Juicing transactions</span>
                    </div>
                </div>
                <Link to="/" className="pointer-events-auto hover:opacity-80 transition-all">
                    <img src={orange_icon} className={classNames('w-24 md:w-32 lg:w-48 h-full z-20')} />
                </Link>
                <div className="flex items-center justify-center flex-wrap gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(100 - (100 * (assetData?.halvingSupply || 0)) / totalHalvingSupply, 0)}%{' '}
                        </span>
                        <span className="text-sm opacity-80">Halving progress</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {assetData
                                ? formatAmount(
                                      (2.86 * assetData.halvingSupply * 5) / (assetData.minerReward * 86400),
                                      0,
                                  )
                                : 0}
                        </span>
                        <span className="text-sm opacity-80">Days to halving</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount(assetData?.minerReward || 0, decimals)} ORA
                        </span>
                        <span className="text-sm opacity-80">Current reward</span>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <span className="font-bold heading text-2xl">
                            {formatAmount((assetData?.minerReward || 0) / 2, decimals)} ORA
                        </span>
                        <span className="text-sm opacity-80">Next reward</span>
                    </div>
                </div>
                <div className="pt-6 px-4 text-center text-3xl">
                    Deposit <b className="bg-black rounded text-white px-2 py-1">ALGO</b> to get{' '}
                    <b className="bg-black rounded text-white px-2 py-1">ALGO</b> +{' '}
                    <b className="bg-orange-600 rounded text-white px-2 py-1">ORA</b>
                </div>
                <div className="max-w-screen-sm p-4 text-center text-center pb-4">
                    Below you can deposit ALGO into a smart contract to join an ORA-juicing pool. <br />
                    ORA rewards are automatically added to liquidity. Stakers are automatically rewarded with liquidity
                    tokens according to their stake. <br />
                    Your ALGO deposit <b className="flex-inline">will be spent</b> over time. <br /> Your deposit will
                    be cleared upon dropping below <b>{formatAmount(appData?.minDeposit || 0)}</b> ALGO.
                </div>
                {diff > 0 && (
                    <div className="flex items-center justify-center flex-wrap gap-6 bg-orange-100 p-4 rounded-lg shadow-lg">
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">
                                {formatAmount(appData?.totalDeposited || 0)}
                            </span>
                            <span className="text-sm opacity-80">Current ALGO deposits</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">{formatAmount(appData?.totalSpent || 0)}</span>
                            <span className="text-sm opacity-80">ALGO spent to date</span>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                            <span className="font-bold heading text-2xl">~{formatAmount(totalRewards[0] * 2)}</span>
                            <span className="text-sm opacity-80">Value of rewards in ALGO</span>
                        </div>
                    </div>
                )}
                {diff < 0 ? (
                    <Timer diff={diff} />
                ) : activeAccount ? (
                    <div className="flex flex-col md:flex-row justify-center items-center md:items-start gap-4">
                        <div className="gap-4 flex flex-col max-w-min">
                            <div className="flex flex-col md:flex-row gap-4 w-full justify-around">
                                <div className="flex flex-col items-center gap-2 bg-orange-300 bg-opacity-80 p-4 rounded-lg shadow-lg">
                                    <h1 className="heading text-2xl px-4">Deposit ALGO</h1>
                                    <Input
                                        value={depositAmount}
                                        onChange={setDepositAmount}
                                        type="number"
                                        placeholder="How much?"
                                    />
                                    <span className="text-sm opacity-80">
                                        Your balance: <b>{formatAmount(accountData.balance)} ALGO</b>
                                    </span>
                                    <div className="py-4">
                                        <Button
                                            disabled={
                                                Number.isNaN(actualDeposit) || actualDeposit > accountData.balance
                                            }
                                            onClick={deposit}
                                        >
                                            Deposit
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center bg-orange-300 bg-opacity-80 p-4 px-8 rounded-lg shadow-lg">
                                    <img src={orange_icon} className={classNames('w-16 h-full z-20')} />
                                    <AccountName account={activeAccount.address} />
                                    <div className="py-4">
                                        <Button onClick={() => providers?.forEach((p) => p.disconnect())}>
                                            Disconnect
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            {accountData.assetBalance > 0 && (
                                <div className="flex flex-col md:flex-row w-full items-center justify-around bg-orange-200 p-2 rounded shadow-lg">
                                    <span className="min-w-max flex gap-2 items-center flex-col">
                                        <b>You have liquidity rewards in your wallet!</b>
                                        <span>
                                            <span className="bg-black text-white rounded px-2 py-1">
                                                <b>{formatAmount(walletRewards[0])}</b> ALGO
                                            </span>{' '}
                                            +{' '}
                                            <span className="bg-orange-600 text-white rounded px-2 py-1">
                                                <b>{formatAmount(walletRewards[1], 8)}</b> ORA
                                            </span>{' '}
                                        </span>
                                        <span>You can withdraw them on Tinyman DEX.</span>
                                    </span>
                                    <Link target="_blank" to="https://app.tinyman.org/#/pool/your-positions">
                                        <Button>
                                            <img src={tinyman} className="w-20" />
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                        {accountBox && (
                            <div className="flex gap-1 flex-col items-center bg-orange-300 bg-opacity-80 p-4 rounded-lg shadow-lg">
                                <h1 className="heading text-xl px-4">Your deposit</h1>
                                <span className="bg-black text-white rounded px-2 py-1">
                                    <b>{formatAmount(accountDeposit)}</b> ALGO
                                </span>
                                <h1 className="heading text-xl px-4">Claimable rewards</h1>
                                <span>
                                    <span className="bg-black text-white rounded px-2 py-1">
                                        <b>{formatAmount(accountTotalRewards[0])}</b> ALGO
                                    </span>{' '}
                                    +{' '}
                                    <span className="bg-orange-600 text-white rounded px-2 py-1">
                                        <b>{formatAmount(accountTotalRewards[1], 8)}</b> ORA
                                    </span>
                                </span>
                                <div className="py-4 flex flex-col gap-2">
                                    <Button onClick={withdraw(true)}>Claim rewards</Button>
                                    <Button secondary onClick={withdraw(false)}>
                                        Claim & withdraw
                                    </Button>
                                </div>
                            </div>
                        )}
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
                    </div>
                )}
            </div>
        </div>
    );
}

export default Staking;
