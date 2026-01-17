"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import {
  getCurrentAccount,
  getContract,
  getSigner,
} from "@/utils/contract";
import { uploadToPinata } from "@/utils/pinata";
import { db } from "@/utils/firebase";
import { ref, get, set, remove, push, update } from "firebase/database";

export default function PatientPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data State
  const [members, setMembers] = useState([]);
  const [records, setRecords] = useState([]);
  const [doctors, setDoctors] = useState([]);

  // UI State
  const [activeView, setActiveView] = useState("all"); // 'all', 'upload', 'doctors', or memberId
  const [showAddMember, setShowAddMember] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Mobile responsiveness

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const current = await getCurrentAccount();
      if (!current) {
        if (typeof window !== "undefined") window.location.href = "/";
        return;
      }
      setAccount(current.toLowerCase());

      // Load Data
      await Promise.all([
        loadMembers(current),
        loadRecords(current),
        loadDoctors(current)
      ]);
    } catch (err) {
      console.error("Init error:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- DATA LOADING ---

  const loadMembers = async (userAccount) => {
    const membersRef = ref(db, `users/${userAccount.toLowerCase()}/members`);
    const snapshot = await get(membersRef);
    let loadedMembers = [];

    if (snapshot.exists()) {
      snapshot.forEach(child => {
        loadedMembers.push({ id: child.key, ...child.val() });
      });
    }

    // Check if "Self" exists
    const selfExists = loadedMembers.some(m => m.relation === "Self");

    if (!selfExists) {
      // Auto-create "Self" profile
      try {
        const newMember = {
          name: "My Profile",
          relation: "Self",
          age: "",
          location: "",
          createdAt: Date.now()
        };
        const newRef = push(ref(db, `users/${userAccount.toLowerCase()}/members`));
        await set(newRef, newMember);

        // Add to local list immediately
        loadedMembers.push({ id: newRef.key, ...newMember });
      } catch (e) {
        console.error("Error auto-creating profile:", e);
      }
    }

    setMembers(loadedMembers);
  };

  const loadRecords = async (userAccount) => {
    try {
      // 1. Get CIDs from Smart Contract (Source of Truth for existence)
      const signer = await getSigner();
      const contract = await getContract(signer);
      let recordCIDs = await contract.getMyRecords();
      // Ensure it's an array
      if (!Array.isArray(recordCIDs)) recordCIDs = [...recordCIDs];

      // 2. Get Metadata from Firebase
      const recordsRef = ref(db, `users/${userAccount.toLowerCase()}/records`);
      const snapshot = await get(recordsRef);
      const metadataMap = snapshot.exists() ? snapshot.val() : {};

      // 3. Merge
      // If a CID exists on chain but not firebase, it's a "Legacy" record
      const mergedRecords = recordCIDs.map(cid => {
        const meta = metadataMap[cid] || {};
        return {
          cid: cid,
          memberId: meta.memberId || "unassigned",
          fileName: meta.fileName || "Unknown File",
          fileType: meta.fileType || "unknown",
          uploadedAt: meta.uploadedAt || Date.now(), // Fallback
          description: meta.description || ""
        };
      });

      // Sort by newest first
      mergedRecords.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setRecords(mergedRecords);
    } catch (e) {
      console.error("Error loading records:", e);
    }
  };

  const loadDoctors = async (userAccount) => {
    try {
      const signer = await getSigner();
      const contract = await getContract(signer);

      // 1. Get all registered doctors from chain
      const onChainDoctors = await contract.getAllDoctors();

      // 2. Get approved status for each
      const doctorsList = [];
      for (const docAddr of onChainDoctors) {
        const isApproved = await contract.isDoctorApproved(docAddr);
        doctorsList.push({
          address: docAddr,
          name: "Unknown Doctor",
          profession: "Unknown",
          hospital: "Unknown",
          isApproved: isApproved,
        });
      }

      // 3. Fetch all doctors from Realtime DB for Metadata
      const doctorsRef = ref(db, "doctors");
      const snapshot = await get(doctorsRef);
      const dbDocs = {};
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((key) => {
          dbDocs[key.toLowerCase()] = data[key];
        });
      }

      // 4. Merge
      const mergedDoctors = doctorsList.map(d => {
        const details = dbDocs[d.address.toLowerCase()];
        if (details) {
          return {
            ...d,
            name: details.name || "Unknown",
            profession: details.profession || "Unknown",
            hospital: details.hospital || "Unknown",
          };
        }
        return d;
      });

      setDoctors(mergedDoctors);

    } catch (err) {
      console.error("Error loading doctors", err);
    }
  };

  // --- ACTIONS ---

  const handleAddMember = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newMember = {
      name: formData.get("name"),
      relation: formData.get("relation"),
      age: formData.get("age"),
      location: formData.get("location"),
      createdAt: Date.now()
    };

    const newRef = push(ref(db, `users/${account}/members`));
    await set(newRef, newMember);
    setShowAddMember(false);
    loadMembers(account);
  };

  const handleEditMember = async (memberId, data) => {
    await update(ref(db, `users/${account}/members/${memberId}`), data);
    loadMembers(account);
  };

  // --- RENDER HELPERS ---

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  const activeMember = members.find(m => m.id === activeView);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">

      {/* SIDEBAR */}
      <aside className={`bg-white w-full md:w-72 border-r flex-shrink-0 ${isSidebarOpen ? 'block' : 'hidden'} md:block h-screen sticky top-0 overflow-y-auto`}>
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 font-bold text-xl text-blue-600 cursor-pointer" onClick={() => window.location.href = '/dashboard'}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            MedChain
          </div>
          <p className="text-xs text-gray-500 mt-1">Patient Portal</p>
        </div>

        <nav className="p-4 space-y-2">
          <SidebarItem
            active={activeView === 'all'}
            onClick={() => setActiveView('all')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
            label="All Activity"
          />
          <SidebarItem
            active={activeView === 'upload'}
            onClick={() => setActiveView('upload')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>}
            label="Upload Record"
          />
          <SidebarItem
            active={activeView === 'doctors'}
            onClick={() => setActiveView('doctors')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
            label="Manage Access"
          />
        </nav>

        <div className="p-4 border-t mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Family Members</h3>
            <button onClick={() => setShowAddMember(true)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
          <div className="space-y-1">
            {members.map(member => (
              <SidebarItem
                key={member.id}
                active={activeView === member.id}
                onClick={() => setActiveView(member.id)}
                icon={<div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">{member.name[0]}</div>}
                label={member.name}
              />
            ))}
            {members.length === 0 && <p className="text-sm text-gray-400 italic px-3">No members added</p>}
          </div>
        </div>

        <div className="p-4 border-t mt-auto">
          <WalletConnect />
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8 overflow-y-auto h-screen">
        <div className="max-w-4xl mx-auto">

          {/* Header for Mobile */}
          <div className="md:hidden flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold">MedChain</h1>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 border rounded">Menu</button>
          </div>

          {activeView === 'all' && (
            <AllActivityView records={records} members={members} />
          )}

          {activeView === 'upload' && (
            <UploadView members={members} account={account} onSuccess={() => {
              loadRecords(account);
              setActiveView('all');
            }} />
          )}

          {activeView === 'doctors' && (
            <DoctorsView
              doctors={doctors}
              onUpdate={() => loadDoctors(account)}
            />
          )}

          {activeMember && (
            <MemberView
              member={activeMember}
              records={records.filter(r => r.memberId === activeMember.id)}
              onEdit={(data) => handleEditMember(activeMember.id, data)}
            />
          )}

        </div>
      </main>

      {/* MODALS */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Add Family Member</h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input name="name" required className="w-full mt-1 border rounded-lg px-3 py-2" placeholder="e.g. Sarah Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Relation</label>
                  <select name="relation" required className="w-full mt-1 border rounded-lg px-3 py-2">
                    <option value="Self">Self</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Age</label>
                  <input name="age" type="number" required className="w-full mt-1 border rounded-lg px-3 py-2" placeholder="30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input name="location" required className="w-full mt-1 border rounded-lg px-3 py-2" placeholder="e.g. New York, USA" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowAddMember(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// --- SUB COMPONENTS ---

export function SidebarItem({ active, icon, label, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
        }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </div>
  );
}

export function AllActivityView({ records, members }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">All Activity</h2>

      <div className="relative border-l-2 border-gray-200 ml-3 space-y-8">
        {records.length === 0 ? (
          <div className="pl-6 text-gray-500">No recent activity</div>
        ) : (
          records.map((record, idx) => {
            const member = members.find(m => m.id === record.memberId);
            const memberName = member ? member.name : (record.memberId === 'unassigned' ? 'Unassigned' : 'Unknown');

            return (
              <div key={idx} className="relative pl-6">
                <span className="absolute -left-[9px] top-4 h-4 w-4 rounded-full bg-blue-100 border-2 border-blue-500"></span>
                <div className="bg-white p-4 rounded-xl border shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-900">{record.fileName || "Medical Record"}</p>
                      <p className="text-sm text-gray-500">
                        Added to <span className="font-medium text-gray-700">{memberName}</span>' profile
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {typeof record.uploadedAt === 'number' ? new Date(record.uploadedAt).toLocaleDateString() : 'Unknown Data'}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a href={`https://gateway.pinata.cloud/ipfs/${record.cid}`} target="_blank" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                      View Document <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div >
  );
}

export function DoctorsView({ doctors, onUpdate }) {
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(null);

  const filtered = doctors.filter(d =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    d.hospital.toLowerCase().includes(filter.toLowerCase()) ||
    d.profession.toLowerCase().includes(filter.toLowerCase())
  );

  const handleToggleAccess = async (doctor) => {
    try {
      setLoading(doctor.address);
      const signer = await getSigner();
      const contract = await getContract(signer);

      let tx;
      if (doctor.isApproved) {
        tx = await contract.revokeDoctor(doctor.address);
      } else {
        tx = await contract.approveDoctor(doctor.address);
      }
      await tx.wait();

      onUpdate(); // Reload doctors to get fresh status
    } catch (e) {
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Manage Access</h2>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search doctors by name, hospital, or profession..."
          className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filtered.map((doctor, idx) => (
          <div key={idx} className="bg-white p-4 rounded-xl border flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 w-full">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                {doctor.name[0]}
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{doctor.name}</h3>
                <p className="text-sm text-gray-500">{doctor.profession} • {doctor.hospital}</p>
              </div>
            </div>
            <button
              disabled={loading === doctor.address}
              onClick={() => handleToggleAccess(doctor)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap min-w-[120px] transition-colors ${doctor.isApproved
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {loading === doctor.address ? 'Processing...' : (doctor.isApproved ? 'Revoke Access' : 'Grant Access')}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-center py-8">No doctors found matching your search.</p>
        )}
      </div>
    </div>
  );
}

export function UploadView({ members, account, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (members.length > 0 && !selectedMember) {
      setSelectedMember(members[0].id); // Default to first member
    }
  }, [members]);

  // If no members, fallback to blank so user knows
  const handleMemberSelect = (id) => {
    setSelectedMember(id);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setError("Please select a file");

    // We can allow upload even if no members (unassigned)
    // but better to warn.

    try {
      setUploading(true);
      setError(null);

      // 1. IPFS
      const result = await uploadToPinata(file);
      if (!result.success) throw new Error("Pinata upload failed");

      // 2. Smart Contract
      const signer = await getSigner();
      const contract = await getContract(signer);
      const tx = await contract.addRecord(result.cid);
      await tx.wait();

      // 3. Firebase Metadata
      const targetMemberId = selectedMember || 'unassigned';

      await set(ref(db, `users/${account}/records/${result.cid}`), {
        cid: result.cid,
        memberId: targetMemberId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        uploadedAt: Date.now(),
        description: new FormData(e.target).get("description")
      });

      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Upload Medical Record</h2>
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <form onSubmit={handleUpload} className="space-y-6">

          {error && <div className="text-red-500 text-sm bg-red-50 p-3 rounded">{error}</div>}

          {/* File Input */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors bg-gray-50">
            <input
              type="file"
              id="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0])}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
            <label htmlFor="file" className="cursor-pointer block w-full h-full">
              <div className="bg-white border rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3 shadow-sm">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
              <span className="font-semibold text-gray-900 block">{file ? file.name : "Choose a file"}</span>
              <span className="text-sm text-gray-500 block mt-1">PDF, JPG, PNG up to 10MB</span>
            </label>
          </div>

          {/* Member Select */}
          {members.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Who is this for?</label>
              <div className="grid grid-cols-2 gap-3">
                {members.map(m => (
                  <div
                    key={m.id}
                    onClick={() => handleMemberSelect(m.id)}
                    className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-all ${selectedMember === m.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-200 bg-white'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${selectedMember === m.id ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>{m.name[0]}</div>
                    <span className={`text-sm font-medium ${selectedMember === m.id ? 'text-blue-900' : 'text-gray-700'}`}>{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 p-3 rounded text-sm text-yellow-800 border border-yellow-200">
              No family members detected. This will be uploaded to "Unassigned".
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <input name="description" className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Annual Checkup Report" />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-all active:scale-[0.98] ${uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'} `}
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Uploading...
              </span>
            ) : 'Save Record'}
          </button>

        </form>
      </div>
    </div>
  );
}

export function MemberView({ member, records, onEdit }) {
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    onEdit({
      name: formData.get("name"),
      age: formData.get("age"),
      location: formData.get("location"),
      relation: formData.get("relation"),
    });
    setIsEditing(false);
  };

  return (
    <div>
      {/* Header / Profile Card */}
      <div className="bg-white p-6 rounded-xl border shadow-sm mb-8">
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <input name="name" defaultValue={member.name} className="w-full border rounded p-2" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Relation</label>
                <select name="relation" defaultValue={member.relation} className="w-full border rounded p-2">
                  <option value="Self">Self</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Child">Child</option>
                  <option value="Parent">Parent</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Age</label>
                <input name="age" defaultValue={member.age} className="w-full border rounded p-2" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Location</label>
                <input name="location" defaultValue={member.location} className="w-full border rounded p-2" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1 text-gray-500">Cancel</button>
              <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded">Save Changes</button>
            </div>
          </form>
        ) : (
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
                {member.name[0]}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{member.name}</h2>
                <div className="flex gap-3 text-sm text-gray-500 mt-1">
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{member.relation}</span>
                  <span>{member.age} years old</span>
                  <span>•</span>
                  <span>{member.location}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setIsEditing(true)} className="text-blue-600 text-sm font-medium hover:underline">
              Edit Profile
            </button>
          </div>
        )}
      </div>

      {/* Member Timeline */}
      <h3 className="text-lg font-bold text-gray-900 mb-4">Medical History</h3>
      <div className="space-y-4">
        {records.length === 0 ? (
          <div className="bg-gray-50 p-8 text-center rounded-xl border border-dashed">
            <p className="text-gray-500">No records found for {member.name}</p>
          </div>
        ) : (
          records.map((record, idx) => (
            <div key={idx} className="bg-white p-4 rounded-xl border flex justify-between items-center hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-4">
                <div className="bg-red-50 p-2 rounded text-red-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{record.fileName}</p>
                  <p className="text-sm text-gray-500">{record.description || "No description"}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">{new Date(record.uploadedAt).toLocaleDateString()}</span>
                <a href={`https://gateway.pinata.cloud/ipfs/${record.cid}`} target="_blank" className="text-blue-600 hover:bg-blue-50 p-2 rounded-full">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                </a>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
