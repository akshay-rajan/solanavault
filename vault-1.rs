use anchor_lang::prelude::*;

declare_id!("2Ci88S9zw9NeH7AP9bc65fop2Mcd5iu1umSWFSq5ufkH");

#[program]
pub mod vault {
    use anchor_lang::system_program::{self, Transfer};

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.state.state_bump = ctx.bumps.state;
        ctx.accounts.state.vault_bump = ctx.bumps.vault;

        Ok(())
    }

    pub fn deposit(ctx: Context<Payment>, amount: u64) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );

        system_program::transfer(cpi_context, amount)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Payment>, amount: u64) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        };

        let state_pubkey = ctx.accounts.state.to_account_info().key;
        let seeds = &[
            b"vault",
            state_pubkey.as_ref(),
            &[ctx.accounts.state.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        system_program::transfer(cpi_context, amount)?;

        Ok(())
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        };

        let state_pubkey = ctx.accounts.state.to_account_info().key;
        let seeds = &[
            b"vault",
            state_pubkey.as_ref(),
            &[ctx.accounts.state.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        system_program::transfer(cpi_context, ctx.accounts.vault.lamports())?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    user: Signer<'info>,

    #[account(init, payer = user, seeds = [b"state", user.key.as_ref()], bump, space = 10)]
    state: Account<'info, State>,

    #[account(seeds = [b"vault", state.key().as_ref()], bump)]
    vault: SystemAccount<'info>,

    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Payment<'info> {
    #[account(mut)]
    user: Signer<'info>,

    #[account(mut, seeds = [b"state", user.key.as_ref()], bump = state.state_bump)]
    state: Account<'info, State>,

    #[account(mut, seeds = [b"vault", state.key().as_ref()], bump = state.vault_bump)]
    vault: SystemAccount<'info>,

    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    user: Signer<'info>,

    #[account(mut, seeds = [b"state", user.key.as_ref()], bump = state.state_bump, close = user)]
    state: Account<'info, State>,

    #[account(mut, seeds = [b"vault", state.key().as_ref()], bump = state.vault_bump)]
    vault: SystemAccount<'info>,

    system_program: Program<'info, System>,
}

#[account]
pub struct State {
    pub state_bump: u8,
    pub vault_bump: u8,
}

// https://github.com/aoikurokawa/anchor-vault/blob/master/programs/vault/src/lib.rs
