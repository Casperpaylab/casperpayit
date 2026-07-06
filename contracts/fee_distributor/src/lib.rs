#![no_std]
#![no_main]

#[macro_use]
extern crate alloc;

use alloc::string::String;
use casper_contract::contract_api::{runtime, storage};
use casper_types::{CLType, CLTyped, EntryPoint, EntryPointAccess, EntryPointType, EntryPoints, Key, Parameter};

const OWNER_KEY: &str = "owner_key";
const FEE_PCT_KEY: &str = "fee_pct";
const TOKEN_CONTRACT_HASH_KEY: &str = "token_contract_hash";
const TOKEN_NAME_KEY: &str = "token_name";
const TOKEN_VERSION_KEY: &str = "token_version";

#[no_mangle]
pub extern "C" fn call() {
    let owner: Key = runtime::get_named_arg(OWNER_KEY);
    let fee_pct: u8 = runtime::get_named_arg(FEE_PCT_KEY);
    let token_contract_hash: Key = runtime::get_named_arg(TOKEN_CONTRACT_HASH_KEY);
    let token_name: String = runtime::get_named_arg(TOKEN_NAME_KEY);
    let token_version: String = runtime::get_named_arg(TOKEN_VERSION_KEY);

    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(EntryPoint::new(
        "init",
        vec![
            Parameter::new(OWNER_KEY, Key::cl_type()),
            Parameter::new(FEE_PCT_KEY, CLType::U8),
            Parameter::new(TOKEN_CONTRACT_HASH_KEY, Key::cl_type()),
            Parameter::new(TOKEN_NAME_KEY, CLType::String),
            Parameter::new(TOKEN_VERSION_KEY, CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    let (contract_package_hash, _access_uref) = storage::create_contract_package_at_hash();
    let (contract_hash, _contract_version) = storage::add_contract_version(contract_package_hash, entry_points, Default::default());
    runtime::put_key("fee_distributor", Key::from(contract_hash));

    let owner_uref = storage::new_uref(owner);
    let fee_pct_uref = storage::new_uref(fee_pct);
    let token_contract_hash_uref = storage::new_uref(token_contract_hash);
    let token_name_uref = storage::new_uref(token_name);
    let token_version_uref = storage::new_uref(token_version);

    runtime::put_key(OWNER_KEY, Key::from(owner_uref));
    runtime::put_key(FEE_PCT_KEY, Key::from(fee_pct_uref));
    runtime::put_key(TOKEN_CONTRACT_HASH_KEY, Key::from(token_contract_hash_uref));
    runtime::put_key(TOKEN_NAME_KEY, Key::from(token_name_uref));
    runtime::put_key(TOKEN_VERSION_KEY, Key::from(token_version_uref));
}

