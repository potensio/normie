/**
 * SkillsPage - Workspace Skills Management
 *
 * Allows users to view and upload custom skills.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  FileCode,
  MoreVertical,
  Trash2,
  Download,
  Upload,
  X,
  Check,
} from "lucide-react";

interface SkillsPageProps {
  workspaceId: string;
  workspaceName: string;
  onBack?: () => void;
}

// Static placeholder skills
const PLACEHOLDER_SKILLS = [
  {
    id: "1",
    name: "langsearch",
    description: "Web search and semantic reranking via LangSearch API.",
    createdAt: "2024-04-05T10:00:00Z",
    fileCount: 3,
  },
  {
    id: "2",
    name: "code-review",
    description: "Automated code review with best practices checking.",
    createdAt: "2024-04-04T15:30:00Z",
    fileCount: 1,
  },
  {
    id: "3",
    name: "pr-writer",
    description: "Generate pull request descriptions from commit history.",
    createdAt: "2024-04-03T09:15:00Z",
    fileCount: 2,
  },
];

export function SkillsPage({ workspaceName, onBack }: SkillsPageProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Filter skills based on search
  const filteredSkills = PLACEHOLDER_SKILLS.filter((skill) =>
    skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            ← Back
          </button>
          <span className="text-zinc-300">|</span>
          <h1 className="text-lg font-medium text-zinc-900">Skills</h1>
          <span className="text-sm text-zinc-400">•</span>
          <span className="text-sm text-zinc-500">{workspaceName}</span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            {PLACEHOLDER_SKILLS.length} total
          </span>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-zinc-900 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Upload Skill
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-4 border-b border-zinc-100">
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-3 w-full max-w-md">
          <Search className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-zinc-900 w-full placeholder-zinc-400"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileCode className="w-12 h-12 text-zinc-300 mb-4" strokeWidth={1} />
            <h3 className="text-base font-medium text-zinc-900 mb-1">No skills found</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {searchQuery ? "Try a different search term" : "Upload your first skill"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-2 bg-zinc-100 text-zinc-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-200 transition-colors"
              >
                <Upload className="w-4 h-4" strokeWidth={1.5} />
                Upload Skill
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadSkillModal onClose={() => setShowUploadModal(false)} />
      )}
    </div>
  );
}

// ============================================
// Skill Card
// ============================================

interface SkillCardProps {
  skill: {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    fileCount: number;
  };
}

function SkillCard({ skill }: SkillCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors group">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center">
            <FileCode className="w-4 h-4 text-zinc-600" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-900">{skill.name}</h3>
            <p className="text-xs text-zinc-400">{skill.fileCount} file{skill.fileCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-md flex items-center justify-center hover:bg-zinc-200 transition-all text-zinc-500"
          >
            <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-6 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-10">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                Export
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      
      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{skill.description}</p>
      <p className="text-[10px] text-zinc-400">Added {formatDate(skill.createdAt)}</p>
    </div>
  );
}

// ============================================
// Upload Modal
// ============================================

interface UploadSkillModalProps {
  onClose: () => void;
}

function UploadSkillModal({ onClose }: UploadSkillModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string }>>([]);
  const [skillContent, setSkillContent] = useState(`---
name: my-skill
description: Describe what this skill does
---

# My Skill

Instructions for the AI go here.
`);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files?.[0]) {
      setFiles([...files, { name: e.dataTransfer.files[0].name }]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFiles([...files, { name: e.target.files[0].name }]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-base font-medium text-zinc-900">Upload Skill</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors text-zinc-500"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* File Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              dragActive ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 hover:border-zinc-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-3" strokeWidth={1} />
            <p className="text-sm text-zinc-600 mb-2">Drag and drop SKILL.md or ZIP file</p>
            <p className="text-xs text-zinc-400 mb-3">or</p>
            <label className="inline-flex items-center gap-2 bg-zinc-100 text-zinc-700 text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" strokeWidth={1.5} />
              Browse files
              <input type="file" className="hidden" accept=".md,.zip" onChange={handleFileUpload} />
            </label>
          </div>

          {/* Uploaded Files */}
          {files.length > 0 && (
            <div className="bg-zinc-50 rounded-lg p-2 space-y-1">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-zinc-600">
                  <FileCode className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                  {file.name}
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-zinc-400">or create new</span>
            </div>
          </div>

          {/* SKILL.md Editor */}
          <div>
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-2">
              SKILL.md Content
            </label>
            <textarea
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              className="w-full h-40 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm font-mono text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-200"
              placeholder="---&#10;name: my-skill&#10;description: ...&#10;---&#10;&#10;# Instructions"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-200 bg-zinc-50">
          <button
            onClick={onClose}
            className="text-sm text-zinc-600 hover:text-zinc-900 py-2 px-4 transition-colors"
          >
            Cancel
          </button>
          <button className="bg-zinc-900 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-zinc-800 transition-colors">
            Upload Skill
          </button>
        </div>
      </div>
    </div>
  );
}
