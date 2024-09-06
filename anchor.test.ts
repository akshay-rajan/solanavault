// @ts-nocheck
describe("MyVault", () => {
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
  let vault;

  // Test initialize the vault
  it("Initialize Vault", async () => {
    // Derive the vault PDA (Program Derived Address)
    [vault] = anchor.web3.PublicKey.findProgramAddressSync(
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

    console.log("Vault initialized.\nTransaction Signature:", tx);

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
      console.log("Token is already initialized! Skipping initialization.");
      return; // Do not attempt to initialize if already initialized
    }
    console.log("Mint not found. Attempting to initialize.");
  
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
    console.log(`Initialized Token.\nTransaction Signature: https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
    const newInfo = await pg.connection.getAccountInfo(mint);
    assert(newInfo, "  Mint should be initialized.");
  });

  
  // Test deposit
  it("Deposit Method", async () => {
    const depositSolAmount = 1;
    const depositAmount = depositSolAmount * anchor.web3.LAMPORTS_PER_SOL; // 1 SOL

    // Token Destination
    const destination = await anchor.utils.token.associatedAddress({
      mint: mint,
      owner: payer,
    });

    // Token Balance
    let initialBalance;
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
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: context.tokenProgram,
        associatedTokenProgram: context.associatedTokenProgram,
      })
      .rpc();

    await pg.connection.confirmTransaction(tx);

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

    console.log(
      "Deposited ", depositSolAmount, " SOL into the vault.\nTransaction Signature:", 
      `https://explorer.solana.com/tx/${tx}?cluster=devnet`
    );

    // Verify that the vault's balance has increased by the deposited amount
    const vaultAccount = await program.account.vault.fetch(vault);
    console.log("Vault Balance: ", vaultAccount.balance.toNumber());
  });

  // Test withdraw
  it("Withdraw Method", async () => {
    const withdrawAmount = 1;
    const amount = withdrawAmount * anchor.web3.LAMPORTS_PER_SOL; // 1 SOL

    // Token Source
    const source = await anchor.utils.token.associatedAddress({
      mint: mint,
      owner: payer,
    });
    
    // Get the initial SOL balance of the user
    const initialBalance = await provider.connection.getBalance(
      provider.wallet.publicKey
    );

    // Token context
    const context = {
      metadata: metadataAddress,
      mint,
      payer,
      rent: web3.SYSVAR_RENT_PUBKEY,
      systemProgram: web3.SystemProgram.programId,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
    };
    
    // Perform the withdrawal
    const transactionSignature = await program.methods
      .withdraw(new anchor.BN(amount))
      .accounts({
        vaultAccount: vault,
        user: authority, // Authority of the vault
        authority: authority,
        mint: context.mint,
        source: source,
        tokenProgram: context.tokenProgram,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc()
      .catch((err) => {
        assert.equal(err.msg, "Insufficient balance in the vault.");
      });

    // User LP token balance
    const postBalance = (
      await pg.connection.getTokenAccountBalance(source)
    ).value.uiAmount;
    console.log("Token Balance: ", postBalance);
    
    console.log(
      "Withdrawn ", withdrawAmount, " SOL from the vault. \nTransaction Signature:", 
      `https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`,
    );

    // Sleep to wait for the transaction to finalize
    await sleep(1000);

    // Check the user's balance after withdrawal
    const finalBalance = await provider.connection.getBalance(
      provider.wallet.publicKey
    );
    const fee = BigInt(5000);
    const expected = BigInt(initialBalance) + BigInt(amount) - fee;
    // Round both balances to 6 decimal places before comparison
    const roundedFinalBalance = parseFloat(finalBalance.toString()).toFixed(6);
    const roundedExpectedBalance = parseFloat(expected.toString()).toFixed(6);
    // Expecting user's balance to increase (minus transaction fee)
    assert.ok(roundedExpectedBalance === roundedFinalBalance); 
  });
});

// Running tests...
//   anchor.test.ts:
//   Wallet Program
//     Vault is already initialized. Skipping initialization.
//     ✔ Initialize Vault (191ms)
//     Token ID (Mint Address): 486Gmv7sUkdtuymz4xGct1KWLfwXJwm64tgrjGRuGKFs
//     Token is already initialized! Skipping initialization.
//     ✔ Initialize Token (67ms)
//     Token Balance:  42
//     Token ID (Mint Address): 486Gmv7sUkdtuymz4xGct1KWLfwXJwm64tgrjGRuGKFs
//     Metadata Account: HShh32hQ6WqengwdHJTNvZ7mkjkFiRJ6FCefBLZNWi3q
//     Token Balance: 43
//     Deposited  1  SOL into the vault.
// Transaction Signature: https://explorer.solana.com/tx/61QuqhWGzkwPvsk6f1U8Kj2sWwJrYzAhRPZLFAWQRrCQujF7T3EusgzE6xSDYi1jW9uK755HpkdTKABzV5HFc6gh?cluster=devnet
//     Vault Balance:  33999999550
//     ✔ Deposit Method (1599ms)
// $     Token Balance:  42
//     Withdrawn  1  SOL from the vault. 
// Transaction Signature: https://explorer.solana.com/tx/2xj6jfyyJqoUBsZgR2i7cRsVFiVjZsuKeYVNwURddDrc82E8rcWYqKy5HUkKj4uF2G8xPFU2T3KNwKBDwShbDaU5?cluster=devnet
//     ✔ Withdraw Method (5335ms)
//   4 passing (7s)
