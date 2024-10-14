use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{
        self, 
        mint_to, 
        Mint, 
        MintTo, 
        Token, 
        TokenAccount, 
        burn, 
        Burn, 
        Transfer as SplTransfer
    },
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::DataV2,
        CreateMetadataAccountsV3,
        Metadata as Metaplex,
    },
};


declare_id!("FWTNSo6JUP1vEbpjhwzq7FTmTZPZupVvE3mQgNjFk9QL");


#[program]
pub mod wallet {
    use super::*;

    // Initialize the Vault
    pub fn init_vault(ctx: Context<Initialize>) -> Result<()> {
        // Set the authority to the signer of the transaction
        ctx.accounts.vault_account.authority = *ctx.accounts.authority.key;
        ctx.accounts.vault_account.balance = 0;

        msg!("Vault initialized successfully.");
        Ok(())
    }

    // Initialize the SPL Token
    pub fn init_token(ctx: Context<InitToken>, metadata: InitTokenParams) -> Result<()> {
        let seeds = &["mint".as_bytes(), &[ctx.bumps.mint]];
        let signer = [&seeds[..]];

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

        create_metadata_accounts_v3(
            metadata_ctx,
            token_data,
            false,
            true,
            None,
        )?;

        msg!("Token mint created successfully.");

        Ok(())
    }

    // Deposit SOL to the vault, and gain SPL tokens as a reward
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Transfer SOL to the vault
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_accounts = system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
        };
        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
        system_program::transfer(cpi_context, amount)?;

        // Update the vault balance
        ctx.accounts.vault_account.balance += amount;

        // Calculate LP Tokens to mint
        let lp_tokens_to_mint = amount; // 1 per SOL

        // Mint LP Tokens to the user
        let seeds = &["mint".as_bytes(), &[ctx.bumps.mint]];
        let signer = [&seeds[..]];

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

    // Withdraw SOL from the vault
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // Check if the vault has sufficient balance
        if ctx.accounts.vault_account.balance < amount {
            return Err(Errors::InsufficientBalance.into());
        }

        // Calculate LP Tokens to burn
        let lp_tokens_to_burn = amount; // 1 per SOL
        // Burn the amount of tokens owned by the user
        let seeds = &["mint".as_bytes(), &[ctx.bumps.mint]];
        let signer = [&seeds[..]];

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
            lp_tokens_to_burn,
        )?;

        let vault_account = &mut ctx.accounts.vault_account.to_account_info();
        let user = &mut ctx.accounts.user;

        // Calculate balances after transaction
        let post_from = vault_account
            .lamports()
            .checked_sub(amount)
            .ok_or(Errors::NumericalOverflow)?;
        let post_to = user
            .lamports()
            .checked_add(amount)
            .ok_or(Errors::NumericalOverflow)?;        

        // Transfer
        **vault_account.try_borrow_mut_lamports().unwrap() = post_from;
        **user.try_borrow_mut_lamports().unwrap() = post_to;

        // Bookkeeping: Update the vault's balance.
        ctx.accounts.vault_account.balance -= amount;

        msg!(
            "Withdrawn {} SOL from the vault by burning {} LP Tokens.", 
            amount, 
            lp_tokens_to_burn
        );
        Ok(())
    }

    pub fn deposit_spl(ctx: Context<DepositSpl>, amount: u64) -> Result<()> {
        // Transfer SPL tokens from the user's ATA to vault's ATA
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_context, amount)?;

        // Mint LP tokens based on the deposited SPL tokens
        let lp_tokens_to_mint = amount; // 1 LP token per 1 SPL token deposited
        let seeds = &["mint".as_bytes(), &[ctx.bumps.mint]];
        let signer = [&seeds[..]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    authority: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_lp_ata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                },
                &signer,
            ),
            lp_tokens_to_mint,
        )?;

        msg!("Deposited {} SPL tokens and minted {} LP tokens.", amount, lp_tokens_to_mint);
        Ok(())
    }


    // Withdraw SPL Tokens from the vault
    pub fn withdraw_spl(ctx: Context<WithdrawSpl>, amount: u64) -> Result<()> {
        // Check if the vault has sufficient SPL balance
        if ctx.accounts.vault_ata.amount < amount {
            return Err(Errors::InsufficientBalance.into());
        }

        // Perform the token transfer
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.user_ata.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_context, amount)?;

        msg!("Withdrew {} SPL tokens from the vault.", amount);

        Ok(())
    }

}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [b"myvault".as_ref()],
        bump,
        payer = authority,
        space = 8 + 32 + 8 // Discriminator + Pubkey + u64 for balance
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"myvault".as_ref()],
        bump
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [b"mint"],
        bump
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub destination: Account<'info, TokenAccount>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}


#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub balance: u64,
}

#[derive(Accounts)]
#[instruction(params: InitTokenParams)]
pub struct InitToken<'info> {
    /// New Metaplex Account being created
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    #[account(
        init,
        seeds = [b"mint"],
        bump,
        payer = payer,
        mint::decimals = params.decimals,
        mint::authority = mint,
    )]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metaplex>,
}

// Define the init token params
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct InitTokenParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}

// Withdraw Context
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"myvault".as_ref()],
        bump
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub user: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mint"],
        bump
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub source: Account<'info, TokenAccount>, // User's LP token account
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum Errors {
    #[msg("Insufficient balance in the vault.")]
    InsufficientBalance,
    #[msg("Numerical overflow occurred.")]
    NumericalOverflow,
}

#[derive(Accounts)]
pub struct DepositSpl<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>, // For SPL
    #[account(
        mut,
        seeds = [b"myvault".as_ref()],
        bump
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    #[account(mut)]
    pub vault_ata: Account<'info, TokenAccount>, // For SPL
    #[account(
        mut,
        seeds = [b"mint"],
        bump
    )]
    pub mint: Account<'info, Mint>, // LP token mint
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_lp_ata: Account<'info, TokenAccount>, // User LP ATA
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}


#[derive(Accounts)]
pub struct WithdrawSpl<'info> {
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>, // To
    #[account(mut)]
    pub vault_ata: Account<'info, TokenAccount>, // From 
    #[account(mut)]
    pub authority: Signer<'info>, // Signer
    pub token_program: Program<'info, Token>,
}


// vault: 2CrczMgQ28oj7BX3GVSkAtjGELUjcKUorpNm8jasuHh2
// mint: 486Gmv7sUkdtuymz4xGct1KWLfwXJwm64tgrjGRuGKFs
// spl: Df43zY66xYsveRLG77faLHa3Xo5LSfAkHhPtDdFwyb2r https://spl.solana.com/token
// ata: GvzKqWhaCHUczyEaAkCE2mZvHkRJRvWS6shVNtyuhmxc

