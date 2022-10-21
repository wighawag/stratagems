// SPDX-License-Identifier: AGPL-1.0
pragma solidity 0.8.13;

contract Dummy {

  event Hello(string value);
  string value;

  function hello(string calldata v) external{
    value = v;
    emit Hello(v);
  }
}