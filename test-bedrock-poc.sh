#!/bin/bash

echo "=========================================="
echo "Running Bedrock SDK POC v2"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    exit 1
fi

# Check if BEDROCK_API_KEY is set
if ! grep -q "BEDROCK_API_KEY=" .env; then
    echo "❌ Error: BEDROCK_API_KEY not found in .env"
    exit 1
fi

# Check if BEDROCK_BASE_URL is set
if ! grep -q "BEDROCK_BASE_URL=" .env; then
    echo "❌ Error: BEDROCK_BASE_URL not found in .env"
    exit 1
fi

echo "✅ Environment variables found"
echo ""

# Run the POC v2
echo "Running POC v2 script (ModelRegistry.registerProvider)..."
echo ""

cd apps/server && npx tsx test-bedrock-sdk-v2.ts

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "=========================================="
    echo "✅ POC PASSED"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Review the output above"
    echo "2. Verify tool calls executed without iteration limit"
    echo "3. If successful, proceed with migration using ModelRegistry"
else
    echo "=========================================="
    echo "❌ POC FAILED"
    echo "=========================================="
    echo ""
    echo "Troubleshooting:"
    echo "1. Check error messages above"
    echo "2. Verify BEDROCK_API_KEY and BEDROCK_BASE_URL are correct"
    echo "3. Check if Mantle API is accessible"
fi

exit $exit_code
