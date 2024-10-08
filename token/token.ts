// @ts-nocheck

describe("Test Minter", () => {
    // Metaplex Constants
    const METADATA_SEED = "metadata";
    const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    // Constants from our program
    const MINT_SEED = "mint";
  
    // Data for our tests
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
    
    // Test init token
    it("initialize", async () => {
      
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
  
      const txHash = await pg.program.methods
        .initToken(metadata)
        .accounts(context)
        .rpc();
  
      await pg.connection.confirmTransaction(txHash, 'finalized');
      console.log(`  https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
      const newInfo = await pg.connection.getAccountInfo(mint);
      assert(newInfo, "  Mint should be initialized.");
    });
  
    // Test mint tokens
    it("mint tokens", async () => {

      const destination = await anchor.utils.token.associatedAddress({
        mint: mint,
        owner: payer,
      });

      let initialBalance: number;
      try {
        const balance = (await pg.connection.getTokenAccountBalance(destination))
        initialBalance = balance.value.uiAmount;
      } catch {
        // Token account not yet initiated has 0 balance
        initialBalance = 0;
      } 
    
      const context = {
        mint,
        destination,
        payer,
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      };

      const txHash = await pg.program.methods
        .mintTokens(new BN(mintAmount * 10 ** metadata.decimals))
        .accounts(context)
        .rpc();
      await pg.connection.confirmTransaction(txHash);
      console.log(`  https://explorer.solana.com/tx/${txHash}?cluster=devnet`);

      const postBalance = (
        await pg.connection.getTokenAccountBalance(destination)
      ).value.uiAmount;
      assert.equal(
        initialBalance + mintAmount,
        postBalance,
        "Post balance should equal initial plus mint amount"
      );

        // Log token ID (mint address)
      console.log("Token ID (Mint Address):", mint.toString());

      // Log metadata account
      console.log("Metadata Account:", metadataAddress.toString());

      // Log token balance
      console.log("Token Balance:", postBalance);
    });
});