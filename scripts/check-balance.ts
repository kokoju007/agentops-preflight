import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const pubkey = new PublicKey('B2u5WBNtKGfDMinjguuvKiF1yqREcmjHXEGaj78C2CMx');

  const balance = await connection.getBalance(pubkey);
  console.log('Public Key: B2u5WBNtKGfDMinjguuvKiF1yqREcmjHXEGaj78C2CMx');
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
}

main().catch(console.error);
