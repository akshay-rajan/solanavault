# Solana Vault: A Token Staking Platform

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Instructions](#instructions)
3. [Account Structures](#account-structures)
4. [Error Handling](#error-handling)
5. [Usage](#usage)
6. [Code References](#code-references)

---

## System Architecture

### Core Components

1. **Vault:** A central account that holds SOL or SPL tokens deposited by users.
2. **SPL Tokens:** Custom tokens with metadata used for rewards.
3. **LP Tokens:** Represent the proportional share of the assets in the vault.

### Key Features

- **SOL Operations:** Users can deposit and withdraw SOL.
- **SPL Operations:** Users can deposit and withdraw SPL tokens.
- **Token Minting:** LP tokens are minted as rewards during deposits.
- **Metadata Integration:** SPL tokens are enhanced with metadata (name, symbol, URI).

---

## Instructions

### 1. **Initialize Vault**

**Instruction:** `init_vault`

- Sets up a vault account to store deposited SOL and SPL tokens.

**Context:**

- Authority is the signer.

**Accounts:**

- `authority`: The signer initializing the vault.
- `vault_account`: The vault account to store assets.
- `system_program`: Reference to the system program.
- `rent`: Rent system variable.

**Code:**

```rust
pub fn init_vault(ctx: Context<Initialize>) -> Result<()> {
    ctx.accounts.vault_account.authority = *ctx.accounts.authority.key;
    ctx.accounts.vault_account.balance = 0;
    msg!("Vault initialized successfully.");
    Ok(())
}
```

---

### 2. **Initialize SPL Token**

**Instruction:** `init_token`

- Creates a new SPL token with associated metadata.

**Context:**

- Metadata includes name, symbol, and URI.

**Accounts:**

- `metadata`: Unchecked account for token metadata.
- `mint`: Token mint account.
- `payer`: Account paying initialization fees.
- `system_program`, `token_program`, `rent`, `token_metadata_program`: Program references.

**Code:**

```rust
pub fn init_token(ctx: Context<InitToken>, metadata: InitTokenParams) -> Result<()> {
    let token_data: DataV2 = DataV2 {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };

    let metadata_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_metadata_program.to_account_info(),
        CreateMetadataAccountsV3 {
            payer: ctx.accounts.payer.to_account_info(),
            update_authority: ctx.accounts.mint.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            metadata: ctx.accounts.metadata.to_account_info(),
            mint_authority: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        },
        &signer
    );

    create_metadata_accounts_v3(metadata_ctx, token_data, false, true, None)?;
    msg!("Token mint created successfully.");
    Ok(())
}
```

---

### 3. **Deposit SOL**

**Instruction:** `deposit`

- Transfers SOL to the vault and mints LP tokens as rewards.

**Context:**

- Users deposit SOL, and their share in the vault is represented by LP tokens.

**Accounts:**

- `user`: Signer making the deposit.
- `vault_account`: Vault account receiving SOL.
- `mint`: Mint account for LP tokens.
- `destination`: User’s associated token account for LP tokens.
- `system_program`, `token_program`, `associated_token_program`, `rent`: Program references.

**Code:**

```rust
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault_account.to_account_info(),
            }
        ),
        amount
    )?;

    ctx.accounts.vault_account.balance += amount;
    let lp_tokens_to_mint = amount;

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                authority: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &signer,
        ),
        lp_tokens_to_mint,
    )?;
    msg!("Deposited {} SOL and minted {} LP tokens.", amount, lp_tokens_to_mint);
    Ok(())
}
```

---

### 4. **Withdraw SOL**

**Instruction:** `withdraw`

- Burns LP tokens and transfers equivalent SOL back to the user.

**Context:**

- Users burn LP tokens to redeem their deposited SOL.

**Accounts:**

- `vault_account`: Vault account storing SOL.
- `user`: The user redeeming SOL.
- `mint`: Mint account for LP tokens.
- `source`: User’s LP token account.

**Code:**

```rust
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    if ctx.accounts.vault_account.balance < amount {
        return Err(Errors::InsufficientBalance.into());
    }

    burn(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.source.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            &signer,
        ),
        amount,
    )?;

    let vault_account = &mut ctx.accounts.vault_account.to_account_info();
    let user = &mut ctx.accounts.user;

    **vault_account.try_borrow_mut_lamports()? -= amount;
    **user.try_borrow_mut_lamports()? += amount;
    ctx.accounts.vault_account.balance -= amount;

    msg!("Withdrawn {} SOL and burned {} LP tokens.", amount, amount);
    Ok(())
}
```

---

## Account Structures

### Vault

- **authority**: Pubkey of the authority managing the vault.
- **balance**: Total SOL or SPL tokens stored in the vault.

**Size Calculation:**

- Discriminator: 8 bytes
- Authority: 32 bytes
- Balance: 8 bytes

---

## Error Handling

- **`InsufficientBalance`**: Raised when the vault does not have enough balance for withdrawal.
- **`NumericalOverflow`**: Raised when mathematical operations exceed limits.

---

## Usage

### Deployment Steps

1. Compile the program using Anchor.
2. Deploy it to the Solana blockchain.
3. Initialize accounts and mint SPL tokens.
4. Use a client-side application to interact with deposit and withdrawal functions (will be added).

---

## Code References

- **SPL Token Program:** [https://spl.solana.com/token](https://spl.solana.com/token)

