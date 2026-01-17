"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import { getCurrentAccount, getContract, getProvider, getSigner } from "@/utils/contract";
import { db } from "@/utils/firebase";
import { ref, get, child, update } from "firebase/database";

import { ethers } from "ethers";

export default function DoctorPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // State for search
  const [searchQuery, setSearchQuery] = useState("");
  const [ageRange, setAgeRange] = useState({ min: "", max: "" });

  // Doctor Profile
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // State for My Patients
  const [myPatients, setMyPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null); // stores full patient object now

  // State for Records
  const [patientRecords, setPatientRecords] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

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
      setAccount(current.toLowerCase());

      // Verify user is a doctor
      const provider = await getProvider();
      const contract = await getContract(provider);
      const isDoctor = await contract.isDoctor(current);

      if (!isDoctor) {
        // Check Realtime Database for pending status
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `doctors/${current.toLowerCase()}`));

        if (snapshot.exists() && snapshot.val().status === "pending") {
          setError("Verification Pending");
        } else {
          // Redirect to register if not even pending
          if (typeof window !== "undefined") {
            window.location.href = "/doctor/register";
          }
          return;
        }
      } else {
        // If verified doctor, load my patients AND profile
        await Promise.all([
          loadMyPatients(current),
          loadDoctorProfile(current)
        ]);
      }
    } catch (err) {
      console.error("Init error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMyPatients = async (doctorAddress) => {
    try {
      const patientsRef = child(ref(db), `doctor_patients/${doctorAddress.toLowerCase()}`);
      const snapshot = await get(patientsRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        // data is { patientAddr: { patientAddress: "...", grantedAt: "..." } }

        const patientPromises = Object.keys(data).map(async (key) => {
          const patientAddr = data[key].patientAddress.toLowerCase();

          // Fetch patient profile details (members)
          const membersRef = child(ref(db), `users/${patientAddr}/members`);
          const membersSnap = await get(membersRef);

          let displayName = "Unknown Patient";
          let displayAge = "";
          let displayLocation = "";

          if (membersSnap.exists()) {
            const members = membersSnap.val();
            // Find "Self" strictly.
            const memberList = Object.values(members);
            const selfMember = memberList.find(m => m.relation === "Self");

            if (selfMember) {
              displayName = selfMember.name;
              displayAge = selfMember.age;
              displayLocation = selfMember.location;
            } else {
              // If no Self profile, keep "Unknown Patient" but DO NOT show relatives
              displayName = "Patient (Profile Incomplete)";
            }
          }

          return {
            address: patientAddr,
            grantedAt: data[key].grantedAt,
            name: displayName,
            age: displayAge,
            location: displayLocation
          };
        });

        const resolvedPatients = await Promise.all(patientPromises);
        setMyPatients(resolvedPatients);
      } else {
        setMyPatients([]);
      }
    } catch (err) {
      console.error("Error loading patients:", err);
    }
  };

  const loadDoctorProfile = async (address) => {
    try {
      const docRef = child(ref(db), `doctors/${address.toLowerCase()}`);
      const snapshot = await get(docRef);
      if (snapshot.exists()) {
        setDoctorProfile(snapshot.val());
      }
    } catch (e) {
      console.error("Error loading profile", e);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updates = {
      name: formData.get("name"),
      hospital: formData.get("hospital"),
      profession: formData.get("profession")
    };

    try {
      await update(ref(db, `doctors/${account}`), updates);
      setDoctorProfile({ ...doctorProfile, ...updates });
      setIsEditingProfile(false);
    } catch (e) {
      console.error("Error updating profile", e);
      alert("Failed to update profile");
    }
  };

  const handleSearchPatient = async (patientObjOrAddress = null) => {
    // 1. Resolve Target Address
    let targetAddress;
    let patientDetails = null;

    // Determine if we are using the input state or an argument
    const searchValue = patientObjOrAddress || searchQuery;

    if (typeof searchValue === 'object' && searchValue !== null) {
      // Clicked from list
      targetAddress = searchValue.address.toLowerCase();
      patientDetails = searchValue;
    } else if (typeof searchValue === 'string') {
      // Typed in input
      if (ethers.utils.isAddress(searchValue)) {
        targetAddress = searchValue.toLowerCase();
        // Try to find details in list
        patientDetails = myPatients.find(p => p.address === targetAddress) || { address: targetAddress, name: "External Patient" };
      } else {
        // It's a name, not an address. DO NOT fetch from chain.
        // Just filtering is handled by the list render.
        // If user clicked "Search" explicitly with a name, we can try to find the first match
        const match = myPatients.find(p => p.name.toLowerCase().includes(searchValue.toLowerCase()));
        if (match) {
          targetAddress = match.address.toLowerCase();
          patientDetails = match;
        } else {
          setError("Invalid address and no patient found with that name.");
          return;
        }
      }
    }

    if (!targetAddress) {
      setError("Please select or enter a valid patient address");
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setPatientRecords([]);
      setSelectedPatient(patientDetails);

      const signer = await getSigner();
      const contract = await getContract(signer);

      // Check access
      const canAccess = await contract.canAccessPatient(targetAddress);

      if (canAccess) {
        // 1. Get raw CIDs from chain
        const recordCIDs = await contract.getPatientRecords(targetAddress);

        // 2. Get Metadata and Members from Firebase to enrich
        const recordsRef = child(ref(db), `users/${targetAddress}/records`);
        const membersRef = child(ref(db), `users/${targetAddress}/members`);

        const [recordsSnap, membersSnap] = await Promise.all([
          get(recordsRef),
          get(membersRef)
        ]);

        const metadataMap = recordsSnap.exists() ? recordsSnap.val() : {};
        const membersMap = membersSnap.exists() ? membersSnap.val() : {};

        // Helper to find member name
        const getMemberName = (id) => {
          if (!id || id === 'unassigned') return 'Unassigned';
          // membersMap keys are UUIDs
          if (membersMap[id]) return membersMap[id].name;
          // Fallback searching values if keys don't match (though they should)
          const found = Object.values(membersMap).find(m => m.id === id);
          return found ? found.name : 'Unknown Member';
        };

        const enrichedRecords = (Array.isArray(recordCIDs) ? recordCIDs : []).map(cid => {
          const meta = metadataMap[cid] || {};
          return {
            cid: cid,
            fileName: meta.fileName || "Unknown File",
            description: meta.description || "",
            uploadedAt: meta.uploadedAt || Date.now(),
            memberName: getMemberName(meta.memberId),
            fileType: meta.fileType || "unknown"
          };
        });

        // Sort by date
        enrichedRecords.sort((a, b) => b.uploadedAt - a.uploadedAt);
        setPatientRecords(enrichedRecords);

      } else {
        setError("You do not have access to this patient's records");
        setPatientRecords([]);
      }
    } catch (err) {
      console.error("Search error:", err);
      // Fallback: If network error or contract error
      setError(err.message || "Failed to search patient");
    } finally {
      setSearching(false);
    }
  };

  const getIPFSUrl = (cid) => {
    const gateway =
      import.meta.env.NEXT_PUBLIC_PINATA_GATEWAY ||
      "https://gateway.pinata.cloud/ipfs";
    return `${gateway}/${cid}`;
  };

  const goBack = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard";
    }
  };

  // Filter Logic for List
  const filteredPatients = myPatients.filter(p => {
    const matchNameOrAddress =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.address.toLowerCase().includes(searchQuery.toLowerCase());

    // Logic: If no filter set, ignore age. If filter set, exclude no-age patients, and check range.
    const minAge = ageRange.min === "" ? null : parseInt(ageRange.min);
    const maxAge = ageRange.max === "" ? null : parseInt(ageRange.max);

    // If no filter, age match is auto-true
    if (minAge === null && maxAge === null) return matchNameOrAddress;

    const pAge = parseInt(p.age);
    // If filtering is active but patient has no valid age, exclude them
    if (isNaN(pAge)) return false;

    const passesMin = minAge === null || pAge >= minAge;
    const passesMax = maxAge === null || pAge <= maxAge;

    return matchNameOrAddress && passesMin && passesMax;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Show pending state if not a doctor but has pending application
  if (error === "You are not registered as a doctor" || error?.includes("Verification Pending")) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Pending</h2>
          <p className="text-gray-600 mb-6">
            {error.includes("Verification Pending") ? "Your application is currently being reviewed by an admin." : "You are not authorized as a doctor yet."}
          </p>
          <button
            onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard'; }}
            className="text-purple-600 font-medium hover:text-purple-700"
          >
            Return to Dashboard
          </button>
        </div>
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
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex items-center gap-2">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <h1 className="text-2xl font-bold text-gray-900"> Doctor Portal </h1>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && !error.includes("Verification") && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Left Column: My Patients & Search */}
          <div className="md:col-span-1 space-y-6">

            {/* Filter Box */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Find Patient</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Search</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name or Address (0x...)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Filter by Age Range</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={ageRange.min}
                      onChange={(e) => setAgeRange({ ...ageRange, min: e.target.value })}
                      placeholder="Min"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <input
                      type="number"
                      value={ageRange.max}
                      onChange={(e) => setAgeRange({ ...ageRange, max: e.target.value })}
                      placeholder="Max"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleSearchPatient(null)} // Uses current state
                  disabled={searching}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition-colors"
                >
                  {searching ? "Fetching..." : "Fetch Records"}
                </button>
              </div>
            </div>

            {/* My Patients List */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">Accessible Patients</h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{filteredPatients.length}</span>
              </div>

              {filteredPatients.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-gray-500 text-sm">No patients found matching your filters.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredPatients.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSearchPatient(p)}
                      className={`w-full text-left p-3 rounded-lg transition-all border group ${selectedPatient?.address === p.address ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-300' : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-sm'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm">{p.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{p.age ? `${p.age} years old` : 'Age N/A'} • {p.location || 'Location N/A'}</p>
                        </div>
                      </div>
                      <p className="font-mono text-[10px] text-gray-400 mt-1 truncate">
                        {p.address}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => {
                    setShowProfileModal(true);
                    setIsEditingProfile(false);
                  }}
                  className="flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <span>My Profile</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Records View */}
          <div className="md:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-sm border min-h-[500px]">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Patient Records
              </h2>

              {searching ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-500">Fetching records...</p>
                </div>
              ) : selectedPatient ? (
                <>
                  <div className="mb-6 bg-purple-50 p-6 rounded-xl border border-purple-100 flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-purple-900">{selectedPatient.name}</h3>
                      <p className="text-sm text-purple-700 mt-1">{selectedPatient.age || "?"} years old • {selectedPatient.location || "Unknown Location"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-600 font-mono bg-purple-100 px-2 py-1 rounded">{selectedPatient.address.substring(0, 6)}...{selectedPatient.address.substring(38)}</p>
                    </div>
                  </div>

                  {patientRecords.length === 0 ? (
                    <p className="text-gray-500 text-center py-20 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      No records found for this patient.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {patientRecords.map((record, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-white p-4 rounded-xl border hover:shadow-md transition-shadow"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900">{record.fileName}</span>
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{record.fileType}</span>
                            </div>
                            <p className="text-sm text-gray-600 mb-1">{record.description || "No description provided."}</p>
                            <div className="flex items-center gap-3 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                {record.memberName}
                              </span>
                              <span>•</span>
                              <span>{new Date(record.uploadedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <a
                            href={getIPFSUrl(record.cid)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-4 flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-100 transition-colors font-medium text-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p>Select a patient from the list or search manually to view records.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-900">{"Doctor Profile"}</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-gray-600 rounded-full p-1 hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6">
              {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Full Name</label>
                    <input name="name" defaultValue={doctorProfile?.name} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Hospital / Clinic</label>
                    <input name="hospital" defaultValue={doctorProfile?.hospital} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Profession / Specialty</label>
                    <input name="profession" defaultValue={doctorProfile?.profession} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" required />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">Cancel</button>
                    <button type="submit" className="flex-1 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-md">Save Changes</button>
                  </div>
                </form>
              ) : (
                <div className="text-center">
                  <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center font-bold text-3xl text-purple-600 mx-auto mb-4 border-4 border-white shadow-sm">
                    {doctorProfile?.name?.[0] || "D"}
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{doctorProfile?.name || "Doctor"}</h2>
                  <p className="text-purple-600 font-medium mb-1">{doctorProfile?.profession || "Medical Professional"}</p>
                  <p className="text-gray-500 text-sm mb-6 flex items-center justify-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    {doctorProfile?.hospital || "No Hospital Linked"}
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">License Status</span>
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div> Verified
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Wallet</span>
                      <span className="text-gray-900 font-mono text-xs">{account ? `${account.substring(0, 6)}...${account.substring(38)}` : '...'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsEditingProfile(true)}
                    className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl translate-y-0 hover:-translate-y-0.5"
                  >
                    Edit Profile
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
