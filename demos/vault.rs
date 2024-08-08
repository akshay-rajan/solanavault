use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{mint_to, Mint, MintTo, Token, TokenAccount},
    metadata::{
        create_metadata_accounts_v3,
        mpl_token_metadata::types::DataV2,
        CreateMetadataAccountsV3,
        Metadata as Metaplex,
    },
};

declare_id!("7snwDgoAmwzCQYHnUsJnbXVHXieanus7c49AgoVMaC3r");

// Main program for managing the locker
#[program]
pub mod locker_manager {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, lp_token_metadata: InitTokenParams) -> Result<()> {
        // Set the authority to the signer of the transaction
        ctx.accounts.vault_account.authority = *ctx.accounts.authority.key;
        ctx.accounts.vault_account.lp_token_mint = *ctx.accounts.lp_token_mint.to_account_info().key;
        ctx.accounts.vault_account.balance = 0;

        // Initialize LP token metadata
        let seeds = &["lp_mint".as_bytes(), &[ctx.bumps.lp_token_mint]];
        let signer = [&seeds[..]];

        let token_data: DataV2 = DataV2 {
            name: lp_token_metadata.name,
            symbol: lp_token_metadata.symbol,
            uri: lp_token_metadata.uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let metadata_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(), 
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.authority.to_account_info(),
                update_authority: ctx.accounts.lp_token_mint.to_account_info(),
                mint: ctx.accounts.lp_token_mint.to_account_info(),
                metadata: ctx.accounts.lp_token_metadata.to_account_info(),
                mint_authority: ctx.accounts.lp_token_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            }, 
            &signer,
        );

        create_metadata_accounts_v3(
            metadata_ctx, 
            token_data, 
            true,
            true, 
            None,
        )?;

        msg!("Vault and LP token initialized successfully.");
        Ok(())
    }

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

        // Calculate LP tokens to mint (1 LP token per SOL)
        let lp_tokens_to_mint = amount;

        // Mint LP tokens to the user
        let seeds = &["lp_mint".as_bytes(), &[ctx.bumps.lp_token_mint]];
        let signer = [&seeds[..]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(), 
                MintTo {
                    authority: ctx.accounts.lp_token_mint.to_account_info(),
                    to: ctx.accounts.user_lp_token_account.to_account_info(),
                    mint: ctx.accounts.lp_token_mint.to_account_info(),
                }, 
                &signer,
            ),
            lp_tokens_to_mint,
        )?;

        msg!("Deposited {} SOL and minted {} LP tokens.", amount, lp_tokens_to_mint);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [b"vault".as_ref()],
        bump,
        payer = authority,
        space = 8 + 32 + 32 + 8 // Discriminator + Pubkey + Pubkey + u64 for balance
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    #[account(
        init,
        seeds=[b"lp_mint"],
        bump,
        payer=authority,
        mint::decimals = 0,  // LP tokens will have 0 decimals
        mint::authority = lp_token_mint
    )]
    pub lp_token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub lp_token_metadata: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_metadata_program: Program<'info, Metaplex>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault".as_ref()],
        bump
    )]
    pub vault_account: Box<Account<'info, Vault>>,
    #[account(
        mut,
        seeds = [b"lp_mint"],
        bump
    )]
    pub lp_token_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = lp_token_mint,
        associated_token::authority = user,
    )]
    pub user_lp_token_account: Account<'info, TokenAccount>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub lp_token_mint: Pubkey,
    pub balance: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone)]
pub struct InitTokenParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
}


/*
- Token metadata: {name: "Stake Token", symbol: "STAK", uri:"https://akshay-rajan.github.io/static/token_metadata.json", decimals: 9}
- metadata: ("metadata", Token Metadata, mint)
- mint: ("mint")
 */
 