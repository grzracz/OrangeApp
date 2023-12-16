import axios from 'axios';

const keyToValue = (state: any, key: string): number => {
    const bKey = btoa(key);
    const kv = state.find((k: any) => k['key'] === bKey);
    if (kv) {
        return kv.value.uint;
    }
    return 0;
};

const main = async () => {
    const response = await axios.get('https://testnet-idx.algonode.cloud/v2/transactions?application-id=502190407');
    let lastEffort = 0;
    response.data['transactions'].forEach((tx) => {
        try {
            const effort = keyToValue(tx['global-state-delta'], 'total_effort');
            console.log(tx['fee'], effort - lastEffort);
            lastEffort = effort;
        } catch {}
    });
};

main();
