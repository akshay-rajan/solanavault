// @ts-nocheck
describe("Wallet Program", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = pg.program;

  // Constants from the program
  const VAULT_SEED = "myvault";

  // Metaplex Constants
  const METADATA_SEED = "metadata";
  const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  // Constants from our program
  const MINT_SEED = "mint";

  // Data for testing SPL Token
  const payer = pg.wallet.publicKey;
  const metadata = {
    name: "Just a Test Token",
    symbol: "TEST",
    uri: "https://5vfxc4tr6xoy23qefqbj4qx2adzkzapneebanhcalf7myvn5gzja.arweave.net/7UtxcnH13Y1uBCwCnkL6APKsge0hAgacQFl-zFW9NlI",
    decimals: 9,
  };
  const mintAmount = 10;
  const [mint] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_SEED)],
    pg.PROGRAM_ID
  );

  const [metadataAddress] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(METADATA_SEED),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  // Account to be used as the authority and payer
  const authority = provider.wallet.publicKey;

  // Vault account
  let vault: anchor.web3.PublicKey;

  // Test initialize the vault
  it("Initialize Vault", async () => {
    // Derive the vault PDA (Program Derived Address)
    [vault] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(VAULT_SEED)],
      program.programId
    );

    // Check if the vault is already initialized
    const vaultAccountInfo = await provider.connection.getAccountInfo(vault);
    if (vaultAccountInfo) {
      console.log("Vault is already initialized. Skipping initialization.");
      return; // Skip initialization
    }

    // Vault is not initialized, proceed with initialization
    console.log("Vault not found. Attempting to initialize.");

    // Prepare the context for the initialize instruction
    const tx = await program.methods
      .initVault()
      .accounts({
        authority,
        vaultAccount: vault,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Vault initialized, transaction signature:", tx);

    // Verify that the vault was initialized correctly
    const vaultAccount = await program.account.vault.fetch(vault);
    assert.ok(vaultAccount.authority.equals(authority));
    assert.equal(vaultAccount.balance.toNumber(), 0);
  });

  // Test initialize the token
  it("Initialize Token", async () => {
    
    // Log the token address (mint address)
    console.log("Token ID (Mint Address):", mint.toString());

    const info = await pg.connection.getAccountInfo(mint);
    if (info) {
      console.log("Already initiated! Skipping this test.");
      return; // Do not attempt to initialize if already initialized
    }
    console.log("  Mint not found. Attempting to initialize.");
  
    const context = {
      metadata: metadataAddress,
      mint,
      payer,
      rent: web3.SYSVAR_RENT_PUBKEY,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    };

    const txHash = await program.methods
      .initToken(metadata)
      .accounts(context)
      .rpc();

    await pg.connection.confirmTransaction(txHash, 'finalized');
    console.log(`  https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    const newInfo = await pg.connection.getAccountInfo(mint);
    assert(newInfo, "  Mint should be initialized.");
  });


  // Test deposit
  it("Deposit Method", async () => {
    const depositAmount = 1 * anchor.web3.LAMPORTS_PER_SOL; // 1 SOL

    // Token Destination
    const destination = await anchor.utils.token.associatedAddress({
      mint: mint,
      owner: payer,
    });

    // Token Balance
    let initialBalance: number;
    try {
      const balance = (await pg.connection.getTokenAccountBalance(destination))
      initialBalance = balance.value.uiAmount;
    } catch {
      // Token account not yet initiated has 0 balance
      initialBalance = 0;
    }
    console.log("Token Balance: ", initialBalance);

    // Token Context
    const context = {
      mint,
      destination,
      payer,
      rent: web3.SYSVAR_RENT_PUBKEY,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    };

    // Prepare the context for the deposit instruction
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        user: authority,
        vaultAccount: vault,
        mint: context.mint,
        destination: destination,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: context.tokenProgram,
        associatedTokenProgram: context.associatedTokenProgram,
      })
      .rpc();

    await pg.connection.confirmTransaction(tx);
    console.log(`  https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const postBalance = (
      await pg.connection.getTokenAccountBalance(destination)
    ).value.uiAmount;

    assert.equal(
      initialBalance + (mintAmount / 10),
      postBalance,
      "Post balance should equal initial plus mint amount"
    );

    console.log("Token ID (Mint Address):", mint.toString());
    console.log("Metadata Account:", metadataAddress.toString());
    console.log("Token Balance:", postBalance);

    console.log("Deposited SOL into the vault, transaction signature:", tx);

    // Verify that the vault's balance has increased by the deposited amount
    const vaultAccount = await program.account.vault.fetch(vault);
    console.log("Vault Balance: ", vaultAccount.balance.toNumber());
  });
});

// Running tests...
//   anchor.test.ts:
//   Wallet Program
//     Vault is already initialized. Skipping initialization.
//     ✔ Initialize Vault (77ms)
//     Token ID (Mint Address): 486Gmv7sUkdtuymz4xGct1KWLfwXJwm64tgrjGRuGKFs
//     Already initiated! Skipping this test.
//     ✔ Initialize Token (69ms)
//     Token Balance:  9
//       https://explorer.solana.com/tx/2bB15RNXByqt8xLRMjBz2rzW6yFwK63TShQibnqjnNAHS2ghWvvEt9dL5sMT4WqjddpvauGpwWGNrZD2EARHK6N7?cluster=devnet
//     Token ID (Mint Address): 486Gmv7sUkdtuymz4xGct1KWLfwXJwm64tgrjGRuGKFs
//     Metadata Account: HShh32hQ6WqengwdHJTNvZ7mkjkFiRJ6FCefBLZNWi3q
//     Token Balance: 10
//     Deposited SOL into the vault, transaction signature: 2bB15RNXByqt8xLRMjBz2rzW6yFwK63TShQibnqjnNAHS2ghWvvEt9dL5sMT4WqjddpvauGpwWGNrZD2EARHK6N7
// $     Vault Balance:  12000000000
//     ✔ Deposit Method (1239ms)
//   3 passing (1s)