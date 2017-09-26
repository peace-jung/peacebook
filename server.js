var express = require("express");
var bodyParser = require("body-parser");
var mysql = require("mysql");
var session = require("express-session");
var passport = require("passport");
var LocalStrategy = require("passport-local").Strategy;
var path = require("path");
var MongoClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectId;

var app = express();
var url = "mongodb://localhost:27017/peacebook";


app.use(express.static(path.join(__dirname, 'public')));

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'peacebook'
});
connection.connect(function (err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }
  console.log('Connected MySQL!!');
});

app.set('views');
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));

var login_user = new Array();

app.use(session({
  secret: 'SDjhfSDF6sdfsldfkjsdljf8SDf',
  resave: false,
  saveUninitialized: true
}));

app.listen(3002, function () {
  console.log('Connected Server!!');
});

app.use(passport.initialize());
app.use(passport.session());


passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  return done(null, user[0].name);
});
passport.use(new LocalStrategy(
  function (userID, userPW, done) {
    console.log('LocalStrategy 실행');
    var sql = 'select * from user_info where userID=? and userPW=password(?)';
    var user = [userID, userPW];
    connection.query(sql, user, function (error, results, fields) {
      if (error) {
        console.log("login err 발생 : " + error);
        return done(error);
      }
      else if (results[0] == undefined) {
        console.log("login", false);
        done(null, false);
      }
      else {
        //로그인 성공시
        user = [results[0]];
        login_user.push(user[0].name);
        done(null, user);
      }
    });
  }
));

// 메인화면, 뉴스피드
app.get('/', function (req, res) {
  if (req.isAuthenticated()) {
    var id = req.session.passport.user[0].userID;

    console.log("login_ing", login_user);

    function compare(a, b) {
      return JSON.stringify(a) == JSON.stringify(a);
    };

    MongoClient.connect(url, function (err, db) {
      db.collection('user').find({ "_id": id }, { "friends._id": 1, "info": 1 })
        .toArray(function (err, result) {
          if (err) throw err;

          var name = result[0].info.name;
          var birth = result[0].info.birth;
          var phone = result[0].info.phone;

          var friendList = result[0].friends;

          //친구리스트+자기자신 _id -> 배열로
          var query = '[';
          for (var i in friendList) {
            query += '{"_id":"' + friendList[i]._id + '"}';
            query += ',';
          }
          query += '{"_id":"' + id + '"}]';

          query = JSON.parse(query);

          //var query = {$or:[{"_id":"1"}, {"_id":"2"}]};
          //_id 를 토대로 게시글 가져오기
          db.collection('user').find({ $or: query }, { "_id": 0, "content": 1 })
            .toArray(function (err, result) {
              if (err) {
                console.log(err);
                db.close();
                var data = { "id": id, "name": name, "birth": birth, "phone": phone, "contents": null };
                res.render('newsfeed', data);
              }
              var list = [];
              for (var i in result) {
                for (var j in result[i].content)
                  list.push(result[i].content[j]);
              }
              db.close();

              //중복객체 제거 함수
              function removeDuplicateAry(arr) {
                var hashTable = {};
                return arr.filter(function (el) {
                  var key = JSON.stringify(el);
                  var alreadyExist = !!hashTable[key];
                  return (alreadyExist ? false : hashTable[key] = true);
                });
              }

              list = removeDuplicateAry(list);

              list.sort(function (a, b) {
                return a.date < b.date ? 1 : -1;
              })

              var data = { "id": id, "name": name, "birth": birth, "phone": phone, "contents": list };
              res.render('newsfeed', data);
            });
        });
    });
  }
  else {
    res.render('index');
  }
});


// 회원가입으로 이동
app.get('/signup', function (req, res) {
  res.render('signup');
});
// 회원정보 저장
app.post('/signup', function (req, res) {
  var user_info = [req.body.userID, req.body.userPW, req.body.name,
  req.body.birth, req.body.phone, req.body.inlineRadioOptions];

  connection.query('insert into user_info (userID, userPW, name, birth, phone, sex) values (?, password(?), ?, ?, ?, ?)', user_info, function (error, results, fields) {
    if (error) {
      console.log("err 발생 : " + error);
      res.send('<script type="text/javascript">alert("오류발생");location.href("/signup")</script>');
    }
    else {
      MongoClient.connect(url, function (err, db) {
        if (err) {
          console.log(err);
          db.close();
        }

        db.collection('user').insert({
          _id: user_info[0],
          info: { name: user_info[2], birth: user_info[3], phone: user_info[4], sex: user_info[5] }
        },
          function (err, result) {
            if (err) throw err;
            db.close();
          });
      });

      res.render('index');
    }
  });
});




//로그인 시도
app.post('/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/',
    failureFlash: false
  })
);
app.get('/logout', function (req, res) {
  for (var i in login_user) {
    if (login_user[i] === req.session.passport.user[0].name) {
      console.log("logout", login_user[i]);
      login_user.splice(i, 1);
    }
  }
  console.log("login_ing", login_user);
  req.logout();
  req.session.save(function () {
    res.redirect('/');
  });
});

//뉴스피드 글쓰기
app.post("/upload", function (req, res) {
  var date = new Date();
  var test = function (number) { //월 일 시 분 -> 10보다 작으면 앞에 0을 붙임 (정렬때문에)
    return number < 10 ? "0" + number : number;
  }
  var data = {
    $push: {
      "content": {
        $each: [{
          _id: ObjectId(),
          date: date.getFullYear() + "년"
          + test(date.getMonth() + 1) + "월"
          + test(date.getDate()) + "일"
          + test(date.getHours()) + "시"
          + test(date.getMinutes()) + "분"
          + test(date.getSeconds()) + "초",
          write: req.body.status,
          writer: req.session.passport.user[0].userID,
          writer_name: req.session.passport.user[0].name,
          comment: []
        }],
        $position: 0
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.session.passport.user[0].userID }, data, { upsert: true }, function (err, result) {
      if (err) throw err;
      db.close();
      res.redirect('/');
    });
  });
});

//댓글달기
app.post("/addComment", function (req, res) {
  console.log(req.body._id, req.body.data);

  var query = { "content._id": ObjectId(req.body._id) };
  var update = {
    $addToSet: {
      "content.$.comment": {
        "_id": ObjectId(),
        "write": req.body.data,
        "writer": req.session.passport.user[0].userID,
        "writer_name": req.session.passport.user[0].name
      }
    }
  };

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update(query, update);
  });

  res.send({ result: "success add" });
});


//개인정보수정
app.get('/updateInfo', function (req, res) {
  var info = null;
  MongoClient.connect(url, function (err, db) {
    db.collection('user').find({ _id: req.session.passport.user[0].userID }).toArray(function (err, result) {
      if (err) throw err;
      if (result[0].info)
        info = result[0].info;
      db.close();

      res.render('updateInfo', { "name": req.session.passport.user[0].name, "info": info });
    });
  });
});

app.post(('/updateInfo'), function (req, res) {
  var query = [req.body.name, req.body.birth, req.body.phone, req.body.inlineRadioOptions, req.session.passport.user[0].userID];
  connection.query('UPDATE user_info SET name=?, birth=?, phone=?, sex=? where userID=?',
    query);


  var data = {
    $set: {
      info: {
        name: req.body.name,
        birth: req.body.birth,
        phone: req.body.phone,
        sex: req.body.inlineRadioOptions
      }
    }
  };

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.session.passport.user[0].userID }, data, function (err, result) {
      if (err) throw err;
      db.close();
      res.redirect('/');
    });
  });
});



//타임라인
app.get("/timeline", function (req, res) {
  var result = null;
  MongoClient.connect(url, function (err, db) {
    db.collection('user').find({ _id: req.session.passport.user[0].userID }).toArray(function (err, result) {
      if (err) throw err;
      if (result[0])
        result = result[0];
      db.close();

      res.render('timeline', { "result": result, "isFriend": true });
    });
  });
});
//id 로 타임라인 방문
app.get("/timeline/:id", function (req, res) {
  var result = null;
  MongoClient.connect(url, function (err, db) {
    db.collection('user').find({ _id: req.params.id })
      .toArray(function (err, result) {
        if (err) throw err;
        else if (result[0] == undefined)
          res.redirect('/');
        else {
          result = result[0];


          db.collection('user')
            .find({ $and: [{ _id: req.params.id }, { "friends._id": req.session.passport.user[0].userID }] })
            .toArray(function (err, result2) {
              //console.log(result2);
              db.close();
              if (result2[0] == undefined) {
                res.render('timeline', { "result": result, "isFriend": false });
              } else {
                res.render('timeline', { "result": result, "isFriend": true });
              }
            });
        }
      });
  });
});
//타임라인에 글쓰기
app.post("/timeline/write", function (req, res) {
  var date = new Date();
  var test = function (number) {
    return number < 10 ? "0" + number : number;
  }
  var writer_name = req.session.passport.user[0].name == req.body.name ? req.body.name : req.session.passport.user[0].name + " > " + req.body.name;
  var data = {
    $push: {
      "content": {
        $each: [{
          _id: ObjectId(),
          date: date.getFullYear() + "년"
          + test(date.getMonth() + 1) + "월"
          + test(date.getDate()) + "일"
          + test(date.getHours()) + "시"
          + test(date.getMinutes()) + "분"
          + test(date.getSeconds()) + "초",
          write: req.body.status,
          writer: req.session.passport.user[0].userID,
          writer_name: writer_name,
          comment: []
        }],
        $position: 0
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.body.id },
      data, { upsert: true }, function (err, result) {
        if (err) throw err;
        db.collection('user').update({ _id: req.session.passport.user[0].userID },
          data, { upsert: true }, function (err, result) {
            if (err) throw err;
            db.close();
            res.send(req.body);
          });
      });
  });
});




//친구

//친구리스트
app.get("/friendsList", function (req, res) {
  var friends = null;
  MongoClient.connect(url, function (err, db) {
    db.collection('user').find({ _id: req.session.passport.user[0].userID }).toArray(function (err, result) {
      if (err) throw err;
      if (result[0].friends)
        friends = result[0].friends;
      db.close();

      var data = {
        "name": req.session.passport.user[0].name,
        "friends": friends
      }
      res.render('friendsList', data);
    });
  });
});
//친구 수락했을 때
app.post("/friends/add", function (req, res) {
  var id = req.body.id;
  var name = req.body.name;
  console.log(id, name);

  var data1 = {
    $addToSet: {
      friends: {
        _id: id,
        name: name
      }
    },
    $pull: {
      newfriends: {
        _id: id,
        name: name
      }
    }
  }
  var data2 = {
    $addToSet: {
      friends: {
        _id: req.session.passport.user[0].userID,
        name: req.session.passport.user[0].name
      }
    },
    $pull: {
      newfriends: {
        _id: req.session.passport.user[0].userID,
        name: req.session.passport.user[0].name
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.session.passport.user[0].userID }, data1, { upsert: true }, function (err, result) {
      if (err) {
        console.log(err);
        db.close();
      }
      db.close();
    });

    db.collection('user').update({ _id: id }, data2, { upsert: true }, function (err, result) {
      if (err) {
        console.log(err);
        db.close();
      }
      db.close();
    });
  });

  res.send({ result: "success add" });
});
//새로 온 친구 요청
app.get("/newfriends", function (req, res) {
  var newfriends = null;
  MongoClient.connect(url, function (err, db) {
    db.collection('user').find({ _id: req.session.passport.user[0].userID }).toArray(function (err, result) {
      if (err) throw err;
      if (result[0].newfriends)
        newfriends = result[0].newfriends;
      db.close();

      var data = {
        "name": req.session.passport.user[0].name,
        "friends": newfriends
      }
      res.render('friends', data);
    });
  });
});
//친구 신청했을 때
app.post("/newfriends/add", function (req, res) {
  var id = req.body.id;
  var name = req.body.name;
  console.log(id, name);

  var data = {
    $addToSet: {
      newfriends: {
        _id: req.session.passport.user[0].userID,
        name: name
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: id }, data, { upsert: true }, function (err, result) {
      if (err) {
        console.log(err);
        db.close();
      }
      db.close();
    });
  });

  res.send({ result: "success add" });
});
//친구 요청 삭제
app.post("/newfriends/remove", function (req, res) {
  var id = req.body.id;
  var name = req.body.name;
  console.log(id, name);

  var data = {
    $pull: {
      newfriends: {
        _id: id,
        name: name
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.session.passport.user[0].userID }, data, { upsert: true }, function (err, result) {
      if (err) {
        console.log(err);
        db.close();
      }
      db.close();
    });
  });

  res.send({ result: "success remove" });
});
//친구를 삭제
app.post("/friends/remove", function (req, res) {
  var id = req.body.id;
  var name = req.body.name;
  console.log(id, name);

  var data = {
    $pull: {
      friends: {
        _id: id,
        name: name
      }
    }
  }
  var data2 = {
    $pull: {
      friends: {
        _id: req.session.passport.user[0].userID,
        name: req.session.passport.user[0].name
      }
    }
  }

  MongoClient.connect(url, function (err, db) {
    if (err) {
      console.log(err);
      db.close();
    }

    db.collection('user').update({ _id: req.session.passport.user[0].userID }, data, { upsert: true }, function (err, result) {
      if (err) {
        console.log(err);
        db.close();
      }
      db.collection('user').update({ _id: id }, data2, { upsert: true }, function (err, result) {
        if (err) {
          console.log(err);
          db.close();
        }
        db.close();
      });
    });
  });

  res.send({ result: "success remove" });
});
//이름으로 검색
app.post("/findFriends", function (req, res) {
  var name = req.body.friendname;
  var sql = 'SELECT userID, name, birth, sex FROM user_info WHERE name LIKE "%' + req.body.friendname + '%"';
  connection.query(sql, function (error, results, fields) {
    if (error) {
      console.log('err');
    } else {

      for (var i in results) {
        if (results[i].userID == req.session.passport.user[0].userID) {
          //console.log(results[i].userID);
          results.splice(i, 1);
          break;
        }
      }

      var data = {
        "name": req.session.passport.user[0].name,
        "friends": results
      };
      res.render('find_friends', data);
    }
  });
});
