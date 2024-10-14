// @ts-nocheck
describe("MyVault", () => {
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
  // Test deposit SPL token
  it("Deposit SPL Method", async () => {
    const splMint = new anchor.web3.PublicKey("Df43zY66xYsveRLG77faLHa3Xo5LSfAkHhPtDdFwyb2r");
    const depositAmount = 10 * (10 ** 9); // Assuming the SPL token has 9 decimal places
    
    console.log(mint.toString());
    // Associated Token Account for User
    const userAta = await anchor.utils.token.associatedAddress({
        mint: splMint,
        owner: payer, // payer is the user's publicKey
    });
    console.log("User's Associated Token Account: ", userAta.toString());

    // // Associated Token Account for Vault
    const vaultAta = await anchor.utils.token.associatedAddress({
        mint: splMint,
        owner: vault, // vault is the vault's publicKey (PDA)
    });
    console.log("Vault's Associated Token Account: ", vaultAta.toString());
    
    // Fetch the initial balance of the user and vault
    let initialUserBalance = (await pg.connection.getTokenAccountBalance(userAta)).value.uiAmount;
    let initialVaultBalance = (await pg.connection.getTokenAccountBalance(vaultAta)).value.uiAmount;
    console.log("Initial User Balance:", initialUserBalance);
    console.log("Initial Vault Balance:", initialVaultBalance);

    // Ensure the user has enough tokens for the deposit
    if (initialUserBalance < (depositAmount / (10 ** 9))) {
        throw new Error("Insufficient SPL tokens in user's account for deposit.");
    }

    // Prepare the context for the deposit_spl instruction
    const tx = await program.methods
        .depositSpl(new anchor.BN(depositAmount)) // Using the correct deposit amount
        .accounts({
            fromAuthority: payer, // payer is the signer
            fromAta: userAta, // user's token account (SPL)
            vaultAta: vaultAta, // vault's token account (SPL)
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

    console.log(`Deposit Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Fetch the balances after the deposit
    const finalUserBalance = (await pg.connection.getTokenAccountBalance(userAta)).value.uiAmount;
    const finalVaultBalance = (await pg.connection.getTokenAccountBalance(vaultAta)).value.uiAmount;

    console.log("Final User Balance:", finalUserBalance);
    console.log("Final Vault Balance:", finalVaultBalance);

    // Validate the changes in balances
    assert.equal(
        finalUserBalance, initialUserBalance - (depositAmount / (10 ** 9)),
        "User's balance should decrease by the deposit amount."
    );
    assert.equal(
        finalVaultBalance, initialVaultBalance + (depositAmount / (10 ** 9)),
        "Vault's balance should increase by the deposit amount."
    );

    console.log("Deposited", depositAmount / (10 ** 9), "SPL Tokens into the vault.");
  });
  // Test deposit SPL token
  it("Deposit SPL Method", async () => {
    const splMint = new anchor.web3.PublicKey("Df43zY66xYsveRLG77faLHa3Xo5LSfAkHhPtDdFwyb2r");
    const depositAmount = 10 * (10 ** 9);
    
    console.log(mint.toString());
    // Associated Token Account for User
    const userAta = await anchor.utils.token.associatedAddress({
        mint: splMint,
        owner: payer, // payer is the user's publicKey
    });
    console.log("User's Associated Token Account: ", userAta.toString());

    // // Associated Token Account for Vault
    const vaultAta = await anchor.utils.token.associatedAddress({
        mint: splMint,
        owner: vault, // vault is the vault's publicKey (PDA)
    });
    console.log("Vault's Associated Token Account: ", vaultAta.toString());
    
    // Fetch the initial balance of the user and vault
    let initialUserBalance = (await pg.connection.getTokenAccountBalance(userAta)).value.uiAmount;
    let initialVaultBalance = (await pg.connection.getTokenAccountBalance(vaultAta)).value.uiAmount;
    console.log("Initial User Balance:", initialUserBalance);
    console.log("Initial Vault Balance:", initialVaultBalance);

    // Ensure the user has enough tokens for the deposit
    if (initialUserBalance < (depositAmount / (10 ** 9))) {
        throw new Error("Insufficient SPL tokens in user's account for deposit.");
    }

    // Prepare the context for the deposit_spl instruction
    const tx = await program.methods
        .depositSpl(new anchor.BN(depositAmount)) // Using the correct deposit amount
        .accounts({
            fromAuthority: payer, // payer is the signer
            fromAta: userAta, // user's token account (SPL)
            vaultAta: vaultAta, // vault's token account (SPL)
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();

    await sleep(1000);

    console.log(`Deposit Transaction Signature: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Fetch the balances after the deposit
    const finalUserBalance = (await pg.connection.getTokenAccountBalance(userAta)).value.uiAmount;
    const finalVaultBalance = (await pg.connection.getTokenAccountBalance(vaultAta)).value.uiAmount;

    console.log("Final User Balance:", finalUserBalance);
    console.log("Final Vault Balance:", finalVaultBalance);

    // Validate the changes in balances
    assert.equal(
        finalUserBalance, initialUserBalance - (depositAmount / (10 ** 9)),
        "User's balance should decrease by the deposit amount."
    );
    assert.equal(
        finalVaultBalance, initialVaultBalance + (depositAmount / (10 ** 9)),
        "Vault's balance should increase by the deposit amount."
    );

    console.log("Deposited", depositAmount / (10 ** 9), "SPL Tokens into the vault.");
  });
});

// Running tests...
//   anchor.test.ts:
//   MyVault
//     Vault is already initialized. Skipping initialization.
//     ✔ Initialize Vault (78ms)
//     Token ID (Mint Address): 7pP8ndKYLAzJxnoXccxTZzZVYNzgQTx3DZX1MUDkWME6
//     Token is already initialized! Skipping initialization.
//     ✔ Initialize Token (98ms)
//     Token Balance:  3
//     Token ID (Mint Address): 7pP8ndKYLAzJxnoXccxTZzZVYNzgQTx3DZX1MUDkWME6
//     Metadata Account: B7mSvT561KuYA3fD92DLnUeMfthWyHdD2FisvqnBdNZD
//     Token Balance: 4
//     Deposited  1  SOL into the vault.
// Transaction Signature: https://explorer.solana.com/tx/2RAqF1igKgFsfs9ZVqcrMtt4iXagwo13ddZjywxFB6DphHxxHnbLXiFiCfhiSdp1GEBfcWQBYx3XbS5LWrkd24CL?cluster=devnet
//     Vault Balance:  4000000000
//     ✔ Deposit Method (1336ms)
//     Token Balance:  4
//     Withdrawn  1  SOL from the vault. 
// Transaction Signature: https://explorer.solana.com/tx/21XzAGqMQRgvddxukrUW2XXsvVUDcLxcM3jyi3iPqDdWCyyyisi8sAHfCoRJMPExpdPUD16TSk5kgW3bCF8hxh5E?cluster=devnet
//     ✔ Withdraw Method (1849ms)
//     7pP8ndKYLAzJxnoXccxTZzZVYNzgQTx3DZX1MUDkWME6
//     User's Associated Token Account:  FyRiu4fF1raH3qsMqp9qWxxsrg6QeVVdvpCqyUj55D3a
//     Vault's Associated Token Account:  DF9Poiopw8GZDzmbxEw4b9TuUeHA6qEdDwBqvR52zoJ8
//     Initial User Balance: 216
//     Initial Vault Balance: 230
//     Deposit Transaction Signature: https://explorer.solana.com/tx/4sJYaGPGGobcV4DvryyW7mRGKtdXuqbVeLtgRFUaqhxhGwH3bcj3W3mUPFhuqmZgP9sq2WnQLZ3YKzWAs2YB8yXA?cluster=devnet
//     Final User Balance: 206
//     Final Vault Balance: 240
//     Deposited 10 SPL Tokens into the vault.
//     ✔ Deposit SPL Method (870ms)
//     7pP8ndKYLAzJxnoXccxTZzZVYNzgQTx3DZX1MUDkWME6
//     User's Associated Token Account:  FyRiu4fF1raH3qsMqp9qWxxsrg6QeVVdvpCqyUj55D3a
//     Vault's Associated Token Account:  DF9Poiopw8GZDzmbxEw4b9TuUeHA6qEdDwBqvR52zoJ8
//     Initial User Balance: 206
//     Initial Vault Balance: 240
//     Deposit Transaction Signature: https://explorer.solana.com/tx/2jevsBrRwUB2PKCS6PsaZ39Wu6npkpsEouKTrr7uSgAntp1J6bpraHZ7uEoYrdz4khvbsbeY7ehF1xURwLheQtdE?cluster=devnet
//     Final User Balance: 196
//     Final Vault Balance: 250
//     Deposited 10 SPL Tokens into the vault.
//     ✔ Deposit SPL Method (2706ms)
//   6 passing (7s)