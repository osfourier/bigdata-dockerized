#!/usr/bin/env bash

getCorpus() {
  echo "Getting QualitasCorpus..."
  cd /QualitasCorpus
  wget ftp://custsrv1.bth.se/FTP/QualitasCorpus/QualitasCorpus-20130901r-pt1.tar
  wget ftp://custsrv1.bth.se/FTP/QualitasCorpus/QualitasCorpus-20130901r-pt2.tar
  tar xf QualitasCorpus-20130901r-pt1.tar
  tar xf QualitasCorpus-20130901r-pt2.tar
  yes | QualitasCorpus-20130901r/bin/install.pl
  rm QualitasCorpus-20130901r-pt1.tar
  rm QualitasCorpus-20130901r-pt2.tar  
}


printCorpusStats() {
  echo "Statistics for QualitasCorpus"
  echo "------------------------------"
  echo "Creation time       :" $( stat -c "%z" /QualitasCorpus/QualitasCorpus-20130901r )
  echo "Size on disk        :" $( du -hs /QualitasCorpus/QualitasCorpus-20130901r )
  cd /QualitasCorpus/QualitasCorpus-20130901r/Systems
  echo "Number of files     :" $( find -type f | wc -l )
  echo "Number of Java files:"  $( find -type f -name "*.java" | wc -l )
  echo "Size of Java files  :" $( find -type f -name "*.java" -print0 | du -hc --files0-from - | tail -n1 )
  echo -e "\n=== Detailed File Type Analysis ==="
  echo "Top 10 file types by size:"
  find /QualitasCorpus -type f -exec du -b {} \; | \
  awk -F. '{sum[$NF] += $1} END {for (ext in sum) printf "%d\t%s\n", sum[ext], ext}' | \
  sort -rn | head -10 | \
  awk '{printf "%.2f GB\t%s\n", $1/(1024*1024*1024), $2}'

  echo -e "\nTop 10 file types by count:"
  find /QualitasCorpus -type f | awk -F. '{print $NF}' | sort | uniq -c | sort -rn | head -10
}

# Start here
# --------------------

echo "Staring Corpus-Getter..."
echo "Start command is:" $0 $@

if [[ "$1" == "FETCH" ]]; then
  echo "Started with FETCH argument, fetching corpus..."
  getCorpus
  echo ""
  printCorpusStats
else
  printCorpusStats
fi

# Wait for keypress, then end container
# --------------------
read -n 1 -p "Press any key to end the container."
