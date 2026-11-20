import {table,tables} from './database'
import {games,makeBoard,observedAt} from './nba'
import {nflGames,makeLens} from './nfl'
export function seedReviewSports(){
 const boards=games.map(makeBoard),players=boards.flatMap(b=>b.players),teams=[...new Map(games.flatMap(g=>[g.home_team,g.visitor_team]).map(t=>[t.id,t])).values()]
 tables.nba_teams=teams.map(t=>({id:t.id,payload:{...t,conference:t.id===2||t.id===20?'East':'West',division:'Illustrative'}}))
 tables.nba_players=players.map(p=>({id:p.id,payload:p,fetched_at:observedAt}))
 tables.nba_games=games.map(g=>({id:g.id,game_date:g.date,season:g.season,postseason:false,home_team_id:g.home_team.id,visitor_team_id:g.visitor_team.id,payload:g}))
 tables.nba_player_game_stats=players.flatMap(p=>p.logs.map(l=>({id:l.id,player_id:p.id,game_id:l.game.id,game_date:l.game.date,postseason:false,payload:l})))
 tables.nfl_teams=nflGames.flatMap(g=>[g.away,g.home]).map(t=>({team_abbr:t.abbr,team_name:t.name,team_color:t.color,team_color2:t.color2,team_logo_espn:t.logo,team_logo_wikipedia:t.logo,team_conf:'AFC',team_division:'Illustrative'}))
 tables.nfl_players=nflGames.flatMap(g=>makeLens(g).windows.season.players).map(p=>({gsis_id:p.id,display_name:p.name,full_name:p.name,position:p.position,position_group:p.position,jersey_number:p.jersey,headshot:p.headshot,latest_team:p.team,status:'ACT',years_of_experience:6,college_name:'Illustrative profile',first_season:2024,last_season:2030}))
 tables.nfl_player_stats=table('nfl_players').flatMap((p,i)=>Array.from({length:10},(_,j)=>({player_id:p.gsis_id,player_display_name:p.display_name,season:2030,season_type:'REG',week:10-j,team:p.latest_team,opponent_team:p.latest_team==='KC'?'BUF':'KC',completions:22+i,attempts:33+i,passing_yards:252+i*8,passing_tds:2,interceptions:j%3===0?1:0,carries:16,rushing_yards:75+i*2,rushing_tds:1,receptions:5,targets:7,receiving_yards:70+i*3,receiving_tds:j%2,fantasy_points_ppr:22+i})))
 tables.nfl_schedule=nflGames.map(g=>({game_id:g.id,season:g.season,week:g.week,game_type:'REG',gameday:g.gameday,gametime:g.gametime,away_team:g.away.abbr,home_team:g.home.abbr,stadium:g.stadium,roof:g.roof,surface:g.surface}))
}
