use anchor_lang::prelude::*;
use anchor_lang::system_program;

// This is your program's public key and it will update
// automatically when you build the project.
declare_id!("FWTNSo6JUP1vEbpjhwzq7FTmTZPZupVvE3mQgNjFk9QL");


// Main program for managing the locker
#[program]
pub mod locker_manager {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Set the authority to the signer of the transaction
        ctx.accounts.vault_account.authority = *ctx.accounts.authority.key;
        ctx.accounts.vault_account.balance = 0;

        msg!("Vault initialized successfully.");
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

        msg!("Deposited {} SOL.", amount);
        Ok(())
    }

    // Withdraw SOL from the vault
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        
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

        msg!("Withdrawn {} SOL from the vault.", amount);
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
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub balance: u64,
}

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
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum Errors {
    #[msg("Insufficient balance in the vault.")]
    InsufficientBalance,
    #[msg("Numerical overflow occurred.")]
    NumericalOverflow,
}

// vault: 2CrczMgQ28oj7BX3GVSkAtjGELUjcKUorpNm8jasuHh2
