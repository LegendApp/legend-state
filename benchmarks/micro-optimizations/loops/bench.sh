data_file="../../data/largeNumberArrayData.json"
echo "Subsituting '$data_file' into forEach.js and forLoop.js"
gsed -i "s+DATA_FILE_PATH+'$data_file'+g" forEach.js
gsed -i "s+DATA_FILE_PATH+'$data_file'+g" forLoop.js

# echo "Compiling forLoop.js"
# hermes --commonjs forLoop.js $data_file -emit-binary -out=forLoop.hbc
# echo "Compiling forEach.js"
# hermes --commonjs forEach.js $data_file -emit-binary -out=forEach.hbc

echo "Running Node Benchmarks"
hyperfine --warmup 3 "node forLoop.js" "node forEach.js"
echo ""
echo ""
echo "Running Hermes Benchmarks"
hyperfine --warmup 3 "hermes forLoop.hbc" "hermes forEach.hbc"
# echo ""
# echo ""
# echo ""
# hyperfine --warmup 3 "DATA='../../data/smallObjectSmallArray' node forLoop.js" "DATA='../../data/smallObjectSmallArray' node forEach.js"
# echo ""
# echo ""
# echo ""
# hyperfine --warmup 3 "DATA='../../data/largeObjectSmallArray' node forLoop.js" "DATA='../../data/largeObjectSmallArray' node forEach.js"

# echo "Adding back DATA_FILE_PATH"
# gsed -i "s+'$data_file'+DATA_FILE_PATH+g" forEach.js
# gsed -i "s+'$data_file'+DATA_FILE_PATH+g" forLoop.js

# rm forLoop.hbc
# rm forEach.hbc