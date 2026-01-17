"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import {
  getCurrentAccount,
  getContract,
  getSigner,
  getProvider,
} from "@/utils/contract";
import { db } from "@/utils/firebase";
import { ref, query, orderByChild, equalTo, get, update } from "firebase/database";

export default function AdminPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  const [doctors, setDoctors] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [newDoctorAddress, setNewDoctorAddress] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const current = await getCurrentAccount();
      if (!current) {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
        return;
      }
      setAccount(current);

      // Verify user is admin
      const provider = await getProvider();
      const contract = await getContract(provider);
      const adminAddress = await contract.admin();

      if (current.toLowerCase() !== adminAddress.toLowerCase()) {
        setError("You are not the admin");
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
        await loadDoctors();
      }
    } catch (err) {
      console.error("Init error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const signer = await getSigner();
      const contract = await getContract(signer);
      const allDoctors = await contract.getAllDoctors();
      setDoctors(allDoctors);

      // Load pending doctors from Realtime DB
      const doctorsRef = ref(db, "doctors");
      const pendingQuery = query(doctorsRef, orderByChild("status"), equalTo("pending"));
      const snapshot = await get(pendingQuery);

      const pending = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          pending.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
      }
      setPendingDoctors(pending);

    } catch (err) {
      console.error("Error loading doctors:", err);
    }
  };

  const handleVerifyDoctor = async (doctorData) => {
    try {
      setError(null);
      setSuccess(null);

      if (!doctorData.walletAddress) throw new Error("Missing wallet address");

      // 1. Register on Blockchain
      const signer = await getSigner();
      const contract = await getContract(signer);

      // Check if already registered on chain to avoid error
      const isDoc = await contract.isDoctor(doctorData.walletAddress);
      if (!isDoc) {
        const tx = await contract.registerDoctor(doctorData.walletAddress);
        await tx.wait();
      }

      // 2. Update Realtime DB
      const doctorRef = ref(db, `doctors/${doctorData.id}`); // id is the wallet address from key
      await update(doctorRef, {
        status: "verified"
      });

      setSuccess(`Doctor ${doctorData.name} verified successfully!`);
      await loadDoctors();

    } catch (err) {
      console.error("Verification error:", err);
      setError(err.message);
    }
  };

  const handleRejectDoctor = async (id) => {
    if (!confirm("Are you sure you want to reject this application?")) return;
    try {
      const doctorRef = ref(db, `doctors/${id}`);
      await update(doctorRef, {
        status: "rejected"
      });
      setSuccess("Application rejected.");
      await loadDoctors();
    } catch (err) {
      console.error("Rejection error:", err);
      setError(err.message);
    }
  };

  const handleRegisterDoctor = async () => {
    if (!newDoctorAddress) {
      setError("Please enter a doctor address");
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const signer = await getSigner();
      const contract = await getContract(signer);
      const tx = await contract.registerDoctor(newDoctorAddress);
      await tx.wait();

      setSuccess("Doctor registered successfully!");
      setNewDoctorAddress("");
      await loadDoctors();
    } catch (err) {
      console.error("Register error:", err);
      setError(err.message);
    }
  };

  const handleRemoveDoctor = async (doctorAddress) => {
    if (!confirm("Are you sure you want to remove this doctor?")) return;

    try {
      setError(null);
      setSuccess(null);

      const signer = await getSigner();
      const contract = await getContract(signer);
      const tx = await contract.removeDoctor(doctorAddress);
      await tx.wait();

      setSuccess("Doctor removed successfully!");
      await loadDoctors();
    } catch (err) {
      console.error("Remove error:", err);
      setError(err.message);
    }
  };

  const goBack = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button
                onClick={goBack}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <h1 className="text-2xl font-bold text-gray-900">
                  Admin Panel
                </h1>
              </div>
            </div>
            <WalletConnect />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            Access Denied: You are not the admin
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={goBack}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        {/* Pending Approvals */}
        <div className="bg-white rounded-xl p-6 shadow-sm border mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pending Approvals ({pendingDoctors.length})
          </h2>

          {pendingDoctors.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending applications.</p>
          ) : (
            <div className="space-y-4">
              {pendingDoctors.map((doc) => (
                <div key={doc.id} className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{doc.name}</h3>
                    <p className="text-sm text-gray-600">{doc.profession} • {doc.hospital}</p>
                    <p className="text-xs text-gray-500 font-mono mt-1">{doc.walletAddress}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVerifyDoctor(doc)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectDoctor(doc.id)}
                      className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Register Doctor */}
        <div className="bg-white rounded-xl p-6 shadow-sm border mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            Register New Doctor
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newDoctorAddress}
              onChange={(e) => setNewDoctorAddress(e.target.value)}
              placeholder="Doctor wallet address (0x...)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleRegisterDoctor}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              Register
            </button>
          </div>
        </div>

        {/* Registered Doctors */}
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Registered Doctors ({doctors.length})
          </h2>

          {doctors.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No doctors registered yet
            </p>
          ) : (
            <div className="space-y-3">
              {doctors.map((doctor, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-50 p-4 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      Doctor #{index + 1}
                    </p>
                    <p className="text-sm text-gray-500 font-mono">{doctor}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveDoctor(doctor)}
                    className="bg-red-100 text-red-700 px-4 py-2 rounded-lg hover:bg-red-200 flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
