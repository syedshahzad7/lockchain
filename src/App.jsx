// src/App.jsx
import { useEffect, useState } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import abi from "./abi.json";

const CONTRACT_ADDRESS = "0x2e6653b33381b0Ee3e41AF5e46B2B78CC208f2e8"; 
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const [myAmount, setMyAmount] = useState("0");
  const [myUnlockTime, setMyUnlockTime] = useState(0);
  const [contractBalance, setContractBalance] = useState("0");
  const [depositsPaused, setDepositsPaused] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [lockDurationValue, setLockDurationValue] = useState("");
  const [lockDurationUnit, setLockDurationUnit] = useState("minutes");

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [extendDurationValue, setExtendDurationValue] = useState("");
  const [extendDurationUnit, setExtendDurationUnit] = useState("minutes");

  const [status, setStatus] = useState("");
  const [lastTxHash, setLastTxHash] = useState("");

  const getProvider = () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      throw new Error("MetaMask not found");
    }
    return new BrowserProvider(window.ethereum);
  };

  const getSignerAndContract = async () => {
    const provider = getProvider();
    const signer = await provider.getSigner();
    const contract = new Contract(CONTRACT_ADDRESS, abi, signer);
    return { signer, contract, provider };
  };

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const address = accounts[0];
      setWalletAddress(address);

      const chainId = await window.ethereum.request({
        method: "eth_chainId",
      });
      setNetwork(chainId === SEPOLIA_CHAIN_ID ? "Sepolia" : `Chain: ${chainId}`);

      await refreshOnChainData(address);
    } catch (err) {
      console.error(err);
      setStatus("Failed to connect wallet.");
    }
  };

  const refreshOnChainData = async (explicitAddress) => {
    try {
      const { contract } = await getSignerAndContract();
      const addr = explicitAddress || walletAddress;

      // Read owner
      const owner = await contract.owner();
      setOwnerAddress(owner);

      // Read my lock
      if (addr) {
        const [amount, unlockTime] = await contract.getMyLock();
        setMyAmount(formatEther(amount));
        setMyUnlockTime(Number(unlockTime));
      }

      // Contract balance
      const total = await contract.getContractBalance();
      setContractBalance(formatEther(total));

      // Deposits paused?
      const paused = await contract.depositsPaused();
      setDepositsPaused(paused);

      // Determine if current wallet is owner
      if (addr && owner) {
        setIsOwner(addr.toLowerCase() === owner.toLowerCase());
      } else {
        setIsOwner(false);
      }
    } catch (err) {
      console.error(err);
      setStatus("Could not read contract data.");
    }
  };

  const toSeconds = (value, unit) => {
    let seconds = Number(value);
    if (!seconds || seconds <= 0) return 0;
    switch (unit) {
      case "minutes":
        return seconds * 60;
      case "hours":
        return seconds * 60 * 60;
      case "days":
        return seconds * 60 * 60 * 24;
      case "seconds":
      default:
        return seconds;
    }
  };

  // ---- Write: deposit ----
  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      if (!depositAmount || Number(depositAmount) <= 0) {
        setStatus("Enter a positive deposit amount.");
        return;
      }
      if (!lockDurationValue || Number(lockDurationValue) <= 0) {
        setStatus("Enter a positive lock duration.");
        return;
      }

      const lockSeconds = toSeconds(lockDurationValue, lockDurationUnit);
      if (!lockSeconds) {
        setStatus("Invalid lock duration.");
        return;
      }

      setStatus("Sending deposit transaction...");
      const { contract } = await getSignerAndContract();
      const tx = await contract.deposit(lockSeconds, {
        value: parseEther(depositAmount),
      });
      setLastTxHash(tx.hash);
      setStatus("Deposit pending... waiting for confirmation.");
      await tx.wait();
      setStatus("Deposit successful!");
      setDepositAmount("");
      setLockDurationValue("");
      await refreshOnChainData();
    } catch (err) {
      console.error(err);
      setStatus(
        "Deposit failed: " + (err?.reason || err?.message || "Unknown error")
      );
    }
  };

  // ---- Write: withdraw ----
  const handleWithdraw = async (e) => {
    e.preventDefault();
    try {
      if (!withdrawAmount || Number(withdrawAmount) <= 0) {
        setStatus("Enter a positive withdraw amount.");
        return;
      }

      setStatus("Sending withdraw transaction...");
      const { contract } = await getSignerAndContract();
      const tx = await contract.withdraw(parseEther(withdrawAmount));
      setLastTxHash(tx.hash);
      setStatus("Withdraw pending... waiting for confirmation.");
      await tx.wait();
      setStatus("Withdraw successful!");
      setWithdrawAmount("");
      await refreshOnChainData();
    } catch (err) {
      console.error(err);
      setStatus(
        "Withdraw failed: " + (err?.reason || err?.message || "Unknown error")
      );
    }
  };

  // ---- Write: extendMyLock ----
  const handleExtendLock = async (e) => {
    e.preventDefault();
    try {
      if (!extendDurationValue || Number(extendDurationValue) <= 0) {
        setStatus("Enter a positive extension duration.");
        return;
      }

      const extraSeconds = toSeconds(extendDurationValue, extendDurationUnit);
      if (!extraSeconds) {
        setStatus("Invalid extension duration.");
        return;
      }

      setStatus("Sending extendMyLock transaction...");
      const { contract } = await getSignerAndContract();
      const tx = await contract.extendMyLock(extraSeconds);
      setLastTxHash(tx.hash);
      setStatus("Extend lock pending... waiting for confirmation.");
      await tx.wait();
      setStatus("Lock extended successfully!");
      setExtendDurationValue("");
      await refreshOnChainData();
    } catch (err) {
      console.error(err);
      setStatus(
        "Extend lock failed: " + (err?.reason || err?.message || "Unknown error")
      );
    }
  };

  // ---- Owner-only: pauseDeposits ----
  const handleTogglePause = async () => {
    try {
      if (!isOwner) {
        setStatus("Only the contract owner can pause or resume deposits.");
        return;
      }
      setStatus("Sending pauseDeposits transaction...");
      const { contract } = await getSignerAndContract();
      const desired = !depositsPaused;
      const tx = await contract.pauseDeposits(desired);
      setLastTxHash(tx.hash);
      setStatus("pauseDeposits pending... waiting for confirmation.");
      await tx.wait();
      setStatus(
        desired ? "Deposits are now paused." : "Deposits have been resumed."
      );
      await refreshOnChainData();
    } catch (err) {
      console.error(err);
      setStatus(
        "pauseDeposits failed: " + (err?.reason || err?.message || "Unknown error")
      );
    }
  };

  // Account / network listeners
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        refreshOnChainData(accounts[0]);
      } else {
        setWalletAddress("");
        setIsOwner(false);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (!window.ethereum) return;
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedUnlockTime =
    myUnlockTime > 0 ? new Date(myUnlockTime * 1000).toLocaleString() : "—";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #1d4ed8 0, #020617 45%, #020617 100%)",
        padding: "2rem 1rem",
        display: "flex",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
          margin: "0 auto",
          background: "#020617",
          borderRadius: "18px",
          padding: "2rem 2rem 2.5rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          color: "#e5e7eb",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.9rem",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "999px",
              background:
                "conic-gradient(from 120deg, #22c55e, #0ea5e9, #facc15, #22c55e)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 25px rgba(15,23,42,0.8)",
            }}
          >
            <span
              style={{
                background: "#020617",
                width: "34px",
                height: "34px",
                borderRadius: "999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
              }}
            >
              🧱
            </span>
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.6rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              LockChain: Multi-User Time-Locked Wallet
            </h1>
            <p
              style={{
                margin: "0.3rem 0 0",
                color: "#9ca3af",
                fontSize: "0.95rem",
              }}
            >
              Each wallet gets its own locked balance and unlock time. You can
              withdraw only your own funds after your personal lock expires.
            </p>
          </div>
        </header>

        {/* Intro */}
        <section
          style={{
            marginBottom: "1.8rem",
            background: "#020617",
            borderRadius: "14px",
            padding: "1.35rem 1.4rem",
            border: "1px solid rgba(148,163,184,0.25)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: "0.7rem",
              fontSize: "1.15rem",
              color: "#e5e7eb",
            }}
          >
            What is LockChain?
          </h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: "1rem",
              color: "#cbd5f5",
              fontSize: "0.95rem",
              lineHeight: 1.5,
            }}
          >
            LockChain is a multi-user time-locked savings wallet on the
            Ethereum Sepolia testnet. When you deposit ETH, the contract locks
            your funds until your chosen unlock time. Only <strong>you</strong>{" "}
            can withdraw your own balance after that time. The contract owner
            can pause or resume new deposits, but cannot withdraw other users&apos;
            funds.
          </p>
        </section>

        {/* Grid layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.2rem",
          }}
        >
          {/* Left column: wallet & on-chain info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {/* Wallet */}
            <section
              style={{
                background: "#020617",
                borderRadius: "14px",
                padding: "1.1rem 1.2rem",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.6rem",
                  fontSize: "1.02rem",
                  color: "#e5e7eb",
                }}
              >
                Wallet Connection
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "0.8rem",
                  color: "#9ca3af",
                  fontSize: "0.9rem",
                }}
              >
                Connect your MetaMask wallet on the Sepolia network to view and
                manage your personal lock on LockChain.
              </p>
              <button
                onClick={connectWallet}
                style={{
                  background: "linear-gradient(to right, #4f46e5, #0ea5e9)",
                  border: "none",
                  color: "white",
                  padding: "0.55rem 1.2rem",
                  borderRadius: "999px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 10px 20px rgba(15,23,42,0.7)",
                }}
              >
                Connect Wallet
              </button>
              <div style={{ marginTop: "0.8rem", fontSize: "0.85rem" }}>
                <p style={{ margin: "0.25rem 0" }}>
                  <strong>Wallet:</strong>{" "}
                  <span style={{ color: "#cbd5f5" }}>
                    {walletAddress || "Not connected"}
                  </span>
                </p>
                <p style={{ margin: "0.25rem 0" }}>
                  <strong>Network:</strong>{" "}
                  <span style={{ color: "#cbd5f5" }}>
                    {network || "Unknown"}
                  </span>
                </p>
                <p style={{ margin: "0.25rem 0" }}>
                  <strong>Owner:</strong>{" "}
                  <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>
                    {ownerAddress || "—"}
                  </span>
                </p>
              </div>
            </section>

            {/* On-chain info */}
            <section
              style={{
                background: "#020617",
                borderRadius: "14px",
                padding: "1.1rem 1.2rem",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.6rem",
                  fontSize: "1.02rem",
                  color: "#e5e7eb",
                }}
              >
                My Lock & Contract Info
              </h3>
              <p
                style={{
                  margin: "0.3rem 0",
                  fontSize: "0.9rem",
                  color: "#cbd5f5",
                }}
              >
                <strong>My locked balance:</strong> {myAmount} ETH
              </p>
              <p
                style={{
                  margin: "0.3rem 0",
                  fontSize: "0.9rem",
                  color: "#cbd5f5",
                }}
              >
                <strong>My unlock time:</strong> {formattedUnlockTime}
              </p>
              <p
                style={{
                  margin: "0.3rem 0",
                  fontSize: "0.9rem",
                  color: "#cbd5f5",
                }}
              >
                <strong>Contract balance (all users):</strong> {contractBalance} ETH
              </p>
              <p
                style={{
                  margin: "0.3rem 0 0.8rem",
                  fontSize: "0.9rem",
                  color: depositsPaused ? "#f97316" : "#22c55e",
                }}
              >
                <strong>Deposits:</strong>{" "}
                {depositsPaused ? "Paused" : "Open"}
              </p>
              <button
                onClick={() => refreshOnChainData()}
                style={{
                  background: "rgba(148,163,184,0.15)",
                  border: "1px solid rgba(148,163,184,0.4)",
                  color: "#e5e7eb",
                  padding: "0.45rem 0.9rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </section>

            {/* Owner controls */}
            {isOwner && (
              <section
                style={{
                  background: "#020617",
                  borderRadius: "14px",
                  padding: "1.1rem 1.2rem",
                  border: "1px solid rgba(248, 250, 252, 0.2)",
                }}
              >
                <h3
                  style={{
                    marginTop: 0,
                    marginBottom: "0.6rem",
                    fontSize: "1.02rem",
                    color: "#facc15",
                  }}
                >
                  Owner Controls
                </h3>
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: "0.8rem",
                    color: "#e5e7eb",
                    fontSize: "0.9rem",
                  }}
                >
                  As the contract owner, you can pause or resume new deposits for
                  safety. Users can always withdraw their own funds when their
                  lock expires.
                </p>
                <button
                  onClick={handleTogglePause}
                  style={{
                    background: depositsPaused
                      ? "linear-gradient(to right, #22c55e, #16a34a)"
                      : "linear-gradient(to right, #e11d48, #fb923c)",
                    border: "none",
                    color: "white",
                    padding: "0.5rem 1.1rem",
                    borderRadius: "999px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {depositsPaused ? "Resume Deposits" : "Pause Deposits"}
                </button>
              </section>
            )}
          </div>

          {/* Right column: deposit, withdraw, extend */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {/* Deposit */}
            <section
              style={{
                background: "#020617",
                borderRadius: "14px",
                padding: "1.1rem 1.2rem",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.6rem",
                  fontSize: "1.02rem",
                  color: "#e5e7eb",
                }}
              >
                Deposit & Lock
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "0.8rem",
                  color: "#9ca3af",
                  fontSize: "0.9rem",
                }}
              >
                Choose how much ETH to lock and for how long. You will not be
                able to withdraw until your personal unlock time is reached.
              </p>
              <form
                onSubmit={handleDeposit}
                style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}
              >
                <div style={{ display: "flex", gap: "0.45rem" }}>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Amount in ETH"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "0.45rem 0.6rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "#020617",
                      color: "#e5e7eb",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.45rem" }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Lock duration"
                    value={lockDurationValue}
                    onChange={(e) => setLockDurationValue(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "0.45rem 0.6rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "#020617",
                      color: "#e5e7eb",
                      fontSize: "0.9rem",
                    }}
                  />
                  <select
                    value={lockDurationUnit}
                    onChange={(e) => setLockDurationUnit(e.target.value)}
                    style={{
                      flex: "0 0 120px",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(148,163,184,0.45)",
                      background: "#020617",
                      color: "#e5e7eb",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
                <button
                  type="submit"
                  style={{
                    background: "linear-gradient(to right, #22c55e, #16a34a)",
                    border: "none",
                    color: "white",
                    padding: "0.5rem 1.1rem",
                    borderRadius: "999px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    marginTop: "0.3rem",
                  }}
                >
                  Deposit & Lock
                </button>
              </form>
            </section>

            {/* Withdraw */}
            <section
              style={{
                background: "#020617",
                borderRadius: "14px",
                padding: "1.1rem 1.2rem",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.6rem",
                  fontSize: "1.02rem",
                  color: "#e5e7eb",
                }}
              >
                Withdraw
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "0.8rem",
                  color: "#9ca3af",
                  fontSize: "0.9rem",
                }}
              >
                After your unlock time, you can withdraw part or all of your
                locked balance back to your wallet. Withdrawals always send ETH
                to the caller&apos;s address.
              </p>
              <form
                onSubmit={handleWithdraw}
                style={{ display: "flex", gap: "0.45rem" }}
              >
                <input
                  type="number"
                  step="0.0001"
                  placeholder="Amount in ETH"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "0.45rem 0.6rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "#020617",
                    color: "#e5e7eb",
                    fontSize: "0.9rem",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: "linear-gradient(to right, #e11d48, #fb923c)",
                    border: "none",
                    color: "white",
                    padding: "0.5rem 1.1rem",
                    borderRadius: "999px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Withdraw
                </button>
              </form>
            </section>

            {/* Extend lock */}
            <section
              style={{
                background: "#020617",
                borderRadius: "14px",
                padding: "1.1rem 1.2rem",
                border: "1px solid rgba(148,163,184,0.25)",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.6rem",
                  fontSize: "1.02rem",
                  color: "#e5e7eb",
                }}
              >
                Extend My Lock
              </h3>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "0.8rem",
                  color: "#9ca3af",
                  fontSize: "0.9rem",
                }}
              >
                Add extra time to your current lock. LockChain computes the new
                unlock time from the later of your existing unlock time or the
                current block time, then adds the duration.
              </p>
              <form
                onSubmit={handleExtendLock}
                style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Extra duration"
                  value={extendDurationValue}
                  onChange={(e) => setExtendDurationValue(e.target.value)}
                  style={{
                    flex: "1 1 120px",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "#020617",
                    color: "#e5e7eb",
                    fontSize: "0.9rem",
                  }}
                />
                <select
                  value={extendDurationUnit}
                  onChange={(e) => setExtendDurationUnit(e.target.value)}
                  style={{
                    flex: "0 0 120px",
                    padding: "0.45rem 0.6rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "#020617",
                    color: "#e5e7eb",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <button
                  type="submit"
                  style={{
                    background: "linear-gradient(to right, #0ea5e9, #22c55e)",
                    border: "none",
                    color: "white",
                    padding: "0.5rem 1.1rem",
                    borderRadius: "999px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Extend Lock
                </button>
              </form>
            </section>
          </div>
        </div>

        {/* Status */}
        <section
          style={{
            marginTop: "1.6rem",
            background: "#020617",
            borderRadius: "14px",
            padding: "1rem 1.2rem",
            border: "1px solid rgba(148,163,184,0.25)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              marginBottom: "0.5rem",
              fontSize: "1.02rem",
              color: "#e5e7eb",
            }}
          >
            Status / Result
          </h3>
          <p
            style={{
              marginTop: 0,
              marginBottom: "0.55rem",
              fontSize: "0.9rem",
              color: "#e5e7eb",
            }}
          >
            {status || "No recent transactions yet."}
          </p>
          {lastTxHash && (
            <p
              style={{
                margin: 0,
                fontSize: "0.86rem",
              }}
            >
              Last Tx:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#38bdf8", textDecoration: "none" }}
              >
                {lastTxHash.slice(0, 10)}...
              </a>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
