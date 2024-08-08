// @ts-nocheck

describe("LockerManager Program", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LockerManager as Program<LockerManager>;

  // Constants from the program
  const VAULT_SEED = "myvault";

  // Account to be used as the authority and payer
  const authority = provider.wallet.publicKey;

  // Vault account
  let vault: anchor.web3.PublicKey;

  // Test initialize
  it("Initialize the vault", async () => {
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
      .initialize()
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

  // Test deposit
  it("Deposit SOL into the vault", async () => {
    const depositAmount = 1 * anchor.web3.LAMPORTS_PER_SOL; // 1 SOL

    // Prepare the context for the deposit instruction
    const tx = await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accounts({
        user: authority,
        vaultAccount: vault,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Deposited SOL into the vault, transaction signature:", tx);

    // Verify that the vault's balance has increased by the deposited amount
    const vaultAccount = await program.account.vault.fetch(vault);
    assert.equal(vaultAccount.balance.toNumber(), depositAmount);
  });
});
  