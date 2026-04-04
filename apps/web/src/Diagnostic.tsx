export function Diagnostic() {
  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Tailwind Diagnostic</h1>
      
      <div className="space-y-4">
        <div className="p-6 bg-red-500 text-white">
          p-6 should have 1.5rem (24px) padding
        </div>
        
        <div className="px-6 py-4 bg-blue-500 text-white">
          px-6 py-4 should have 1.5rem horizontal, 1rem vertical
        </div>
        
        <div className="p-4 bg-green-500 text-white">
          p-4 should have 1rem (16px) padding
        </div>
        
        <div className="bg-coral text-white p-6">
          bg-coral with p-6
        </div>
        
        <div className="bg-cream p-6 border border-gray-300">
          bg-cream with p-6
        </div>
        
        <div className="bg-[#e8e8e3] p-6">
          bg-[#e8e8e3] (inline arbitrary value) with p-6
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-gray-100 rounded">
        <p className="font-bold mb-2">Check DevTools:</p>
        <ol className="list-decimal ml-6 space-y-1">
          <li>Open DevTools (Ctrl+Shift+I)</li>
          <li>Inspect the colored boxes above</li>
          <li>Check if padding is applied in Computed styles</li>
          <li>Check Console for any CSS errors</li>
          <li>Check Network tab to see if CSS file is loading</li>
        </ol>
      </div>
      
      <div className="mt-4">
        <a href="/" className="text-coral underline">Back to app</a>
      </div>
    </div>
  );
}
